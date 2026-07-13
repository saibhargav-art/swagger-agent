# Strands Local Agent POC

This folder is the desktop/local-agent runtime. It is intentionally separate from the React chat UI.

The React app should stay focused on connection UX and chat UI. This runtime owns agent orchestration:

1. Load customer app tools from `/webapi.json`.
2. Convert every OpenAPI operation into a Strands function tool.
3. Optionally attach Browser MCP for browser control.
4. Optionally attach Context7 MCP for documentation lookup.
5. Let the model select tools and extract parameters from natural language.
6. Let runtime policy enforce confirmations before write actions.

## Folder Shape

```txt
local-agent/
  agent-runtime.ts      # generic Strands orchestration
  server.ts             # local HTTP bridge for the React app
  strands-agent.ts      # CLI entry point
  config.ts             # environment/runtime config
  models/
    ollama-model.ts     # Ollama model adapter for Strands tool events
  tools/
    webmcp-tools.ts     # /webapi.json to Strands tool conversion
    mcp-clients.ts      # optional external MCP server clients
```

Provider-specific code should stay under `models/`. Tool-source-specific code should stay under `tools/`.

## Run

```powershell
npm run agent:poc -- "list the available customer actions"
```

Run the local HTTP service used by the React chat UI:

```powershell
$env:STRANDS_AGENT_PORT="8787"
npm run agent:server
```

Then start the React app with:

```powershell
$env:VITE_STRANDS_AGENT_URL="http://localhost:8787"
npm run dev
```

Configure Ollama/OpenAI/Bedrock, Browser MCP, and Context7 from the Connections page. The terminal only needs to keep the local agent service running.

## Performance Knobs

Local Ollama tool-calling speed depends heavily on model size, CPU/GPU, and conversation history. Defaults are tuned for responsiveness:

```powershell
$env:STRANDS_MAX_TURNS="4"
$env:STRANDS_MAX_TOKENS="6000"
$env:STRANDS_MAX_HISTORY_MESSAGES="6"
$env:OLLAMA_NUM_PREDICT="768"
$env:OLLAMA_NUM_CTX="4096"
$env:OLLAMA_KEEP_ALIVE="10m"
```

For timing logs:

```powershell
$env:STRANDS_DEBUG_TIMING="true"
npm run agent:server
```

With a customer app:

```powershell
$env:WEBMCP_BASE_URL="http://localhost:5173"
$env:WEBMCP_BEARER_TOKEN="<logged-in user token>"
$env:OPENAI_API_KEY="<key>"
npm run agent:poc -- "search orders for vijay"
```

Write actions are blocked by default in this POC:

```powershell
$env:ALLOW_WEBMCP_WRITES="true"
npm run agent:poc -- "create an order for avinash worth 7800"
```

## Browser MCP

Browser MCP can be configured from the Connections page. You can also set defaults in the local agent process:

```powershell
$env:BROWSER_MCP_ENABLED="true"
$env:BROWSER_MCP_COMMAND="<browser-mcp-command>"
$env:BROWSER_MCP_ARGS='["arg1","arg2"]'
```

When Browser MCP is enabled, Strands can use browser tools for page navigation, visible state, login/OTP handoff, and other UI-only actions. WebMCP tools remain the preferred path for direct customer app API actions.

## Why This Shape

The app should not keep adding prompt-specific rules in `ChatService`.

Standard flow:

- Model: understand user text, select the right tool, fill parameters.
- Tools: expose exact app capability and schema from `webapi.json`.
- Runtime: enforce auth, confirmation, write blocking, and error boundaries.
- UI: show user-friendly progress, choices, confirmation, and results.
