import type { ToolRequest } from '../lib/agent-client'
import { label } from '../lib/tool-presentation'
import type { WebMcpProperty } from '../shared/webmcp'

type Props = {
  request: ToolRequest
  busy: boolean
  onApprove: () => void
  onCancel: () => void
}

export default function Confirmation(props: Props) {
  const properties = () => {
    const value = props.request.tool.inputSchema?.properties
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, WebMcpProperty>
      : {}
  }

  return (
    <div class="confirmation" role="dialog" aria-labelledby="confirmation-title">
      <h2 id="confirmation-title">Confirm action</h2>
      <strong>{props.request.tool.title || props.request.tool.name}</strong>
      <p>This approval applies to this tool for the current request only.</p>
      <dl>
        {Object.entries(props.request.input).map(([name, value]) => (
          <><dt>{properties()[name]?.title || label(name)}</dt><dd>{displayValue(value)}</dd></>
        ))}
      </dl>
      <div class="actions">
        <button class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
        <button class="primary" disabled={props.busy} onClick={props.onApprove}>Allow for request</button>
      </div>
    </div>
  )
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${label(key)}: ${displayValue(item)}`)
    .join(', ')
  return value == null ? '-' : String(value)
}
