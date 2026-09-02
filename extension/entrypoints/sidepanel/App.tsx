import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import type { WebMcpProperty, WebMcpResponse, WebMcpTool } from '../../shared/webmcp'

type ActivePage = { title: string; url: string }

export default function App() {
  const [page, setPage] = createSignal<ActivePage>({ title: 'No active page', url: '' })
  const [tabId, setTabId] = createSignal<number>()
  const [tools, setTools] = createSignal<WebMcpTool[]>([])
  const [selectedName, setSelectedName] = createSignal('')
  const [fieldValues, setFieldValues] = createSignal<Record<string, string>>({})
  const [result, setResult] = createSignal('')
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  const refreshActivePage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    setTabId(tab?.id)
    setPage({ title: tab?.title || 'Untitled page', url: tab?.url || '' })
    if (tab?.id) await refreshTools(tab.id)
    else setTools([])
  }

  const refreshTools = async (id = tabId()) => {
    if (!id) return
    setBusy(true)
    setError('')
    const response = await browser.runtime.sendMessage({ type: 'webmcp:list', tabId: id }) as WebMcpResponse<WebMcpTool[]>
    setBusy(false)
    if (!response.ok) {
      setTools([])
      setError(response.error)
      return
    }
    setTools(response.value)
    if (!response.value.some((tool) => tool.name === selectedName())) {
      selectTool(response.value[0]?.name || '', response.value)
    }
  }

  const selectTool = (name: string, available = tools()) => {
    setSelectedName(name)
    const properties = schemaProperties(available.find((tool) => tool.name === name))
    setFieldValues(Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, property.default == null ? '' : String(property.default)]),
    ))
    setError('')
    setResult('')
  }

  const runSelectedTool = async () => {
    const id = tabId()
    const toolName = selectedName()
    if (!id || !toolName) return

    const selected = tools().find((tool) => tool.name === toolName)
    const properties = schemaProperties(selected)
    const required = new Set(schemaRequired(selected))
    const missing = [...required].filter((name) => !fieldValues()[name]?.trim())
    if (missing.length) {
      setError(`Complete required fields: ${missing.join(', ')}.`)
      return
    }
    const parsed = Object.fromEntries(Object.entries(fieldValues())
      .filter(([, value]) => value !== '')
      .map(([name, value]) => [name, coerceValue(value, properties[name]?.type)]))

    setBusy(true)
    setError('')
    setResult('')
    const response = await browser.runtime.sendMessage({
      type: 'webmcp:execute', tabId: id, toolName, input: parsed,
    }) as WebMcpResponse
    setBusy(false)
    if (!response.ok) setError(response.error)
    else setResult(JSON.stringify(response.value, null, 2) ?? 'Completed')
  }

  onMount(() => {
    void refreshActivePage()
    browser.tabs.onActivated.addListener(refreshActivePage)
    browser.tabs.onUpdated.addListener(refreshActivePage)
  })

  onCleanup(() => {
    browser.tabs.onActivated.removeListener(refreshActivePage)
    browser.tabs.onUpdated.removeListener(refreshActivePage)
  })

  return (
    <main>
      <header>
        <div class="mark">W</div>
        <div>
          <h1>WebMCP Assistant</h1>
          <p>cross-browser side panel poc</p>
        </div>
      </header>
      <section class="page" aria-labelledby="active-page-title">
        <span class="status"><i /> active tab</span>
        <h2 id="active-page-title">Active page</h2>
        <strong>{page().title}</strong>
        <p class="url">{page().url || 'Open a website to see its details.'}</p>
      </section>
      <section class="tools" aria-labelledby="tools-title">
        <div class="section-heading">
          <div>
            <h2 id="tools-title">Available tools</h2>
            <p>{tools().length} exposed by this page</p>
          </div>
          <button class="secondary" disabled={busy()} onClick={() => void refreshTools()}>Refresh</button>
        </div>

        <Show when={tools().length > 0} fallback={<p class="empty">{busy() ? 'Checking this page...' : 'No WebMCP tools found.'}</p>}>
          <div class="tool-list">
            <For each={tools()}>{(tool) =>
              <button classList={{ 'tool-option': true, selected: selectedName() === tool.name }} onClick={() => selectTool(tool.name)}>
                <span>{tool.title || tool.name}</span>
                <small>{tool.annotations?.readOnlyHint ? 'read' : 'write'}</small>
              </button>
            }</For>
          </div>
          <Show when={tools().find((tool) => tool.name === selectedName())}>{(tool) =>
            <div class="tool-summary">
              <strong>{tool().title || tool().name}</strong>
              <p>{tool().description || 'No description provided.'}</p>
              <span>{tool().annotations?.readOnlyHint ? 'Read only' : 'May change data'}</span>
            </div>
          }</Show>
          <div class="fields">
            <For each={Object.entries(schemaProperties(tools().find((tool) => tool.name === selectedName())))}>{([name, property]) =>
              <label>
                <span>{property.title || humanize(name)}{schemaRequired(tools().find((tool) => tool.name === selectedName())).includes(name) ? ' *' : ''}</span>
                <Show when={property.enum?.length} fallback={
                  <input
                    type={property.type === 'number' || property.type === 'integer' ? 'number' : 'text'}
                    value={fieldValues()[name] || ''}
                    placeholder={property.description || ''}
                    onInput={(event) => setFieldValues((current) => ({ ...current, [name]: event.currentTarget.value }))}
                  />
                }>
                  <select value={fieldValues()[name] || ''} onChange={(event) => setFieldValues((current) => ({ ...current, [name]: event.currentTarget.value }))}>
                    <option value="">Select...</option>
                    <For each={property.enum}>{(option) => <option value={String(option)}>{String(option)}</option>}</For>
                  </select>
                </Show>
              </label>
            }</For>
          </div>
          <button class="primary" disabled={busy()} onClick={() => void runSelectedTool()}>{busy() ? 'Running...' : 'Run tool'}</button>
        </Show>

        <Show when={error()}><p class="feedback error">{error()}</p></Show>
        <Show when={result()}><pre class="feedback result">{result()}</pre></Show>
      </section>
      <footer>The website owns authentication and backend access. No tokens are read by this extension.</footer>
    </main>
  )
}

function schemaProperties(tool?: WebMcpTool): Record<string, WebMcpProperty> {
  const properties = tool?.inputSchema?.properties
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, WebMcpProperty>
    : {}
}

function schemaRequired(tool?: WebMcpTool): string[] {
  return Array.isArray(tool?.inputSchema?.required)
    ? tool.inputSchema.required.filter((value): value is string => typeof value === 'string')
    : []
}

function coerceValue(value: string, type?: string): unknown {
  if (type === 'number' || type === 'integer') return Number(value)
  if (type === 'boolean') return value === 'true'
  return value
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
