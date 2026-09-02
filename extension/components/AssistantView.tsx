import { For, Show } from 'solid-js'

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

type Props = {
  messages: ChatMessage[]
  value: string
  busy: boolean
  disabled: boolean
  agentConnected: boolean
  modelConfigured: boolean
  onConfigure: () => void
  onInput: (value: string) => void
  onSend: () => void
}

export default function AssistantView(props: Props) {
  return (
    <section class="assistant-view">
      <div class="connection-line">
        <span classList={{ dot: true, online: props.agentConnected }} />
        {props.agentConnected ? 'Strands connected' : 'Start the Strands agent service'}
      </div>

      <Show when={!props.modelConfigured}>
        <div class="setup-notice">
          <div><strong>Connect a model</strong><p>Add an OpenAI or Claude API key before chatting.</p></div>
          <button class="secondary" onClick={props.onConfigure}>Set API key</button>
        </div>
      </Show>

      <div class="messages" aria-live="polite">
        <Show when={props.messages.length} fallback={
          <div class="empty-state">
            <strong>Ask the active page</strong>
            <p>Strands uses the WebMCP tools and required fields exposed by this tab.</p>
          </div>
        }>
          <For each={props.messages}>{(message) =>
            <div classList={{ message: true, user: message.role === 'user' }}>
              <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
              <p>{message.content}</p>
            </div>
          }</For>
        </Show>
        <Show when={props.busy}><p class="working">Working...</p></Show>
      </div>

      <form class="composer" onSubmit={(event) => { event.preventDefault(); props.onSend() }}>
        <textarea
          rows="3"
          placeholder="Ask about this page"
          value={props.value}
          disabled={props.disabled}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
        <button class="primary" disabled={props.disabled || props.busy || !props.value.trim()}>Send</button>
      </form>
    </section>
  )
}
