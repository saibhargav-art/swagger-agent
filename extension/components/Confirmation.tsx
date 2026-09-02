import type { ToolRequest } from '../lib/agent-client'

type Props = {
  request: ToolRequest
  busy: boolean
  onApprove: () => void
  onCancel: () => void
}

export default function Confirmation(props: Props) {
  return (
    <div class="confirmation" role="dialog" aria-labelledby="confirmation-title">
      <h2 id="confirmation-title">Confirm action</h2>
      <strong>{props.request.tool.title || props.request.tool.name}</strong>
      <p>This approval applies to this tool for the current request only.</p>
      <dl>
        {Object.entries(props.request.input).map(([name, value]) => <><dt>{name}</dt><dd>{String(value)}</dd></>)}
      </dl>
      <div class="actions">
        <button class="secondary" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
        <button class="primary" disabled={props.busy} onClick={props.onApprove}>Allow for request</button>
      </div>
    </div>
  )
}
