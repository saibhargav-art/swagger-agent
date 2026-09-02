# WebMCP Assistant Extension

The side panel reads tools from the active webpage through `document.modelContext`. It supports assistant-driven execution and a manual tool inspector from the same generic code path.

The extension sends only tool metadata and user prompts to the local Strands service. Tool execution remains inside the active webpage, preserving its existing login session.

## Development

```powershell
npm run dev
```

Load `.output/chrome-mv3-dev` from `chrome://extensions` or `edge://extensions`. Use `npm run dev:firefox` for Firefox.

The required permissions are `activeTab`, `scripting`, and `tabs`. Host access is needed so the user can run the assistant on the active customer website.
