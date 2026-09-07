# WebMCP Assistant Extension

The side panel reads tools from the active webpage through `document.modelContext`. It supports assistant-driven execution and a manual tool inspector from the same generic code path.

The extension sends only tool metadata and user prompts to the local Strands service. Tool execution remains inside the active webpage, preserving its existing login session.

## Structured tool results

Pages can return an optional presentation contract from any WebMCP tool. The assistant renders it as a generic sectioned card instead of raw JSON or model-generated formatting.

```ts
{
  status: 'needs_input' | 'ready_for_confirmation' | 'ready_for_review' | 'submitted',
  message: 'Short result message',
  missingBySection?: {
    shipment: {
      tab: 'Shipment Details',
      fields: ['Description', 'Weight'],
      sampleReply: 'Description: office chairs. Weight: 480 lbs.'
    }
  },
  capturedBySection?: {
    shipment: { description: 'Office chairs', weight: '480 lbs' }
  },
  sampleReply?: 'Reply text that can be placed in the composer',
  nextAction?: 'tool_name',
  nextActionInput?: { confirmed: true },
  confirmationRequired?: true
  actionLabel?: 'Confirm and create',
  editAction?: 'prepare_tool_name'
}
```

`missingByTab` and `capturedByTab` are accepted as aliases. Section names and field names are converted into readable labels. This contract is optional; tools without it continue to use the normal assistant response.

For a multi-step workflow, return `nextAction` with the exact tool name. Return `nextActionInput` and `confirmationRequired: true` when the next step needs fixed values only after user confirmation. The extension keeps this continuation for the active browser tab and gives it to the agent with the next user message.

Return `actionLabel` to show a direct action button in the result card. Its click is the user's approval, so the extension executes that exact continuation without showing another confirmation dialog. `editAction` tells the agent which tool handles preview corrections.

Missing sections may return field objects instead of text labels. Supported metadata includes `name`, `label`, `type`, `placeholder`, `options`, `required`, and `showWhen`. Return `formAction` with a tool name and button label to submit these exact values directly. Mark that page tool with `uiOnlyHint: true` so it is available to the extension form but hidden from the model.

## Development

```powershell
npm run dev
```

Load `.output/chrome-mv3-dev` from `chrome://extensions` or `edge://extensions`. Use `npm run dev:firefox` for Firefox.

The required permissions are `activeTab`, `scripting`, and `tabs`. Host access is needed so the user can run the assistant on the active customer website.
