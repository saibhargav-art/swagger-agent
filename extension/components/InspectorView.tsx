import { For, Show, createEffect, createSignal } from 'solid-js'

import type { WebMcpProperty, WebMcpTool } from '../shared/webmcp'

type Props = {
  tools: WebMcpTool[]
  busy: boolean
  onRefresh: () => void
  onExecute: (name: string, input: Record<string, unknown>) => Promise<unknown>
}

export default function InspectorView(props: Props) {
  const [selectedName, setSelectedName] = createSignal('')
  const [values, setValues] = createSignal<Record<string, string>>({})
  const [result, setResult] = createSignal('')
  const [error, setError] = createSignal('')
  const [running, setRunning] = createSignal(false)

  const selected = () => props.tools.find((tool) => tool.name === selectedName())

  createEffect(() => {
    if (selectedName() && !props.tools.some((tool) => tool.name === selectedName())) reset()
  })

  const select = (tool: WebMcpTool) => {
    setSelectedName(tool.name)
    setValues(Object.fromEntries(Object.entries(properties(tool)).map(([name, property]) => [
      name, property.default == null ? '' : String(property.default),
    ])))
    setResult('')
    setError('')
  }

  const run = async () => {
    const tool = selected()
    if (!tool) return
    const missing = required(tool).filter((name) => !values()[name]?.trim())
    if (missing.length) return setError(`Complete required fields: ${missing.join(', ')}.`)
    const input = Object.fromEntries(Object.entries(values())
      .filter(([, value]) => value !== '')
      .map(([name, value]) => [name, coerce(value, properties(tool)[name]?.type)]))
    try {
      setRunning(true)
      setError('')
      setResult(formatResult(await props.onExecute(tool.name, input)))
      setSelectedName('')
      setValues({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  const refresh = () => {
    reset()
    props.onRefresh()
  }

  function reset() {
    setSelectedName('')
    setValues({})
    setResult('')
    setError('')
  }

  return (
    <section class="inspector-view">
      <div class="section-heading">
        <div><h2>Page tools</h2><p>{props.tools.length} available</p></div>
        <button class="secondary" disabled={props.busy || running()} onClick={refresh}>Refresh</button>
      </div>
      <Show when={props.tools.length} fallback={<p class="empty">No WebMCP tools are exposed by this page.</p>}>
        <div class="tool-list">
          <For each={props.tools}>{(tool) =>
            <button classList={{ 'tool-option': true, selected: selectedName() === tool.name }} onClick={() => select(tool)}>
              <span>{tool.title || tool.name}</span>
              <small>{tool.annotations?.readOnlyHint ? 'read' : 'write'}</small>
            </button>
          }</For>
        </div>
      </Show>
      <Show when={selected()}>{(tool) =>
        <div class="tool-editor">
          <h3>{tool().title || tool().name}</h3>
          <p>{tool().description || 'No description provided.'}</p>
          <For each={Object.entries(properties(tool()))}>{([name, property]) =>
            <label><span>{label(name)}{required(tool()).includes(name) ? ' *' : ''}</span>
              <Show when={property.enum?.length} fallback={
                <input type={numeric(property.type) ? 'number' : 'text'} value={values()[name] || ''}
                  placeholder={property.description || ''}
                  onInput={(event) => setValues((current) => ({ ...current, [name]: event.currentTarget.value }))} />
              }>
                <select value={values()[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.currentTarget.value }))}>
                  <option value="">Select...</option>
                  <For each={property.enum}>{(option) => <option value={String(option)}>{String(option)}</option>}</For>
                </select>
              </Show>
            </label>
          }</For>
          <button class="primary" disabled={props.busy || running()} onClick={() => void run()}>
            {running() ? 'Running...' : 'Run tool'}
          </button>
        </div>
      }</Show>
      <Show when={error()}><p class="feedback error">{error()}</p></Show>
      <Show when={result()}><pre class="feedback result">{result()}</pre></Show>
    </section>
  )
}

function properties(tool?: WebMcpTool): Record<string, WebMcpProperty> {
  const value = tool?.inputSchema?.properties
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, WebMcpProperty> : {}
}

function required(tool?: WebMcpTool): string[] {
  return Array.isArray(tool?.inputSchema?.required)
    ? tool.inputSchema.required.filter((value): value is string => typeof value === 'string') : []
}

function numeric(type?: string): boolean { return type === 'number' || type === 'integer' }
function coerce(value: string, type?: string): unknown {
  if (numeric(type)) return Number(value)
  if (type === 'boolean') return value === 'true'
  return value
}
function label(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatResult(value: unknown): string {
  if (value == null) return 'Tool completed successfully.'
  if (typeof value === 'string') return value || 'Tool completed successfully.'
  return JSON.stringify(value, null, 2)
}
