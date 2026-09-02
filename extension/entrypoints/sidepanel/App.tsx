import { Show, createSignal, onCleanup, onMount } from 'solid-js'

import AssistantView, { type ChatMessage } from '../../components/AssistantView'
import Confirmation from '../../components/Confirmation'
import InspectorView from '../../components/InspectorView'
import SettingsView from '../../components/SettingsView'
import { connectAgent, returnToolResult, sendMessage, type ModelSettings, type ToolRequest } from '../../lib/agent-client'
import { discoverTools, executeTool } from '../../lib/webmcp-client'
import type { WebMcpTool } from '../../shared/webmcp'

type ActivePage = { tabId?: number; title: string; url: string }
type View = 'assistant' | 'tools' | 'settings'

const sessionId = crypto.randomUUID()
const conversationId = crypto.randomUUID()
const defaultModel: ModelSettings = { provider: 'openai', apiKey: '', modelId: 'gpt-4o-mini' }

export default function App() {
  const [page, setPage] = createSignal<ActivePage>({ title: 'No active page', url: '' })
  const [tools, setTools] = createSignal<WebMcpTool[]>([])
  const [view, setView] = createSignal<View>('assistant')
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [draft, setDraft] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [executing, setExecuting] = createSignal(false)
  const [agentConnected, setAgentConnected] = createSignal(false)
  const [pageError, setPageError] = createSignal('')
  const [pending, setPending] = createSignal<ToolRequest>()
  const [model, setModel] = createSignal<ModelSettings>(defaultModel)
  const approvedWriteScopes = new Set<string>()
  const executionTabs = new Map<string, number>()

  const approvalScope = (request: ToolRequest) => `${request.executionId}:${request.tool.name}`

  const refreshPage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    setPage({ tabId: tab?.id, title: tab?.title || 'Untitled page', url: tab?.url || '' })
    if (!tab?.id) return setTools([])
    try {
      setPageError('')
      setTools(await discoverTools(tab.id))
    } catch (error) {
      setTools([])
      setPageError(error instanceof Error ? error.message : String(error))
    }
  }

  const execute = async (name: string, input: Record<string, unknown>, tabId = page().tabId) => {
    if (!tabId) throw new Error('There is no active webpage.')
    return executeTool(tabId, name, input)
  }

  const completeRequest = async (request: ToolRequest, approved: boolean, rememberApproval = false) => {
    setPending(undefined)
    if (!approved) {
      await returnToolResult(sessionId, request.requestId, { ok: false, error: 'The user cancelled this action.' })
      return
    }
    if (rememberApproval) approvedWriteScopes.add(approvalScope(request))
    setExecuting(true)
    try {
      const tabId = executionTabs.get(request.executionId)
      if (!tabId) throw new Error('The browser tab for this request is no longer available.')
      const result = await execute(request.tool.name, request.input, tabId)
      await returnToolResult(sessionId, request.requestId, { ok: true, result })
      await refreshPage()
    } catch (error) {
      await returnToolResult(sessionId, request.requestId, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleToolRequest = (request: ToolRequest) => {
    if (request.tool.annotations?.readOnlyHint || approvedWriteScopes.has(approvalScope(request))) {
      void completeRequest(request, true)
    }
    else setPending(request)
  }

  const send = async () => {
    const content = draft().trim()
    if (!content || busy()) return
    setDraft('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content }])
    setBusy(true)
    const executionId = crypto.randomUUID()
    const tabId = page().tabId
    if (!tabId) {
      setBusy(false)
      return
    }
    executionTabs.set(executionId, tabId)
    try {
      const reply = await sendMessage(sessionId, conversationId, executionId, content, tools(), model())
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: 'assistant',
        content: error instanceof Error ? error.message : String(error),
      }])
    } finally {
      for (const scope of approvedWriteScopes) {
        if (scope.startsWith(`${executionId}:`)) approvedWriteScopes.delete(scope)
      }
      executionTabs.delete(executionId)
      setBusy(false)
    }
  }

  onMount(() => {
    const disconnectAgent = connectAgent(sessionId, handleToolRequest, setAgentConnected)
    void browser.storage.local.get('modelSettings').then((stored) => {
      const value = stored.modelSettings as ModelSettings | undefined
      if (value?.provider && value.apiKey && value.modelId) setModel(value)
    })
    void refreshPage()
    const onActivated = () => {
      const request = pending()
      if (request) void completeRequest(request, false)
      void refreshPage()
    }
    const onUpdated = (tabId: number, change: { status?: string; url?: string }) => {
      if (tabId === page().tabId && (change.status === 'complete' || Boolean(change.url))) void refreshPage()
    }
    browser.tabs.onActivated.addListener(onActivated)
    browser.tabs.onUpdated.addListener(onUpdated)
    onCleanup(() => {
      disconnectAgent()
      browser.tabs.onActivated.removeListener(onActivated)
      browser.tabs.onUpdated.removeListener(onUpdated)
    })
  })

  return (
    <main>
      <header>
        <div class="mark">W</div>
        <div class="identity"><h1>WebMCP Assistant</h1><p>{page().title}</p></div>
        <span classList={{ 'page-status': true, online: tools().length > 0 }}>{tools().length} tools</span>
      </header>

      <nav class="tabs" aria-label="Assistant views">
        <button classList={{ active: view() === 'assistant' }} onClick={() => setView('assistant')}>Assistant</button>
        <button classList={{ active: view() === 'tools' }} onClick={() => setView('tools')}>Tools</button>
        <button classList={{ active: view() === 'settings' }} onClick={() => setView('settings')}>Settings</button>
      </nav>

      <Show when={pageError()}><p class="page-error">{pageError()}</p></Show>
      <Show when={view() === 'assistant'}>
        <AssistantView
          messages={messages()} value={draft()} busy={busy()}
          disabled={!agentConnected() || tools().length === 0 || !model().apiKey}
          agentConnected={agentConnected()} modelConfigured={Boolean(model().apiKey)}
          onConfigure={() => setView('settings')} onInput={setDraft} onSend={() => void send()}
        />
      </Show>
      <Show when={view() === 'tools'}>
        <InspectorView tools={tools()} busy={busy()} onRefresh={() => void refreshPage()} onExecute={execute} />
      </Show>
      <Show when={view() === 'settings'}>
        <SettingsView settings={model()} onSave={async (settings) => {
          setModel(settings)
          await browser.storage.local.set({ modelSettings: settings })
          setView('assistant')
        }} />
      </Show>

      <Show when={pending()}>{(request) =>
        <Confirmation request={request()} busy={executing()}
          onCancel={() => void completeRequest(request(), false)}
          onApprove={() => void completeRequest(request(), true, true)} />
      }</Show>
    </main>
  )
}
