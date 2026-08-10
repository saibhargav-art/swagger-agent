# Strands Local Agent POC

This folder is the desktop/local-agent runtime. It is intentionally separate from the React chat UI.

The React app should stay focused on connection UX and chat UI. This runtime owns agent orchestration:

1. Load customer app tools from `/webapi.json`.
2. Convert every OpenAPI operation into a Strands function tool.
3. Optionally attach Playwright MCP for browser control.
4. Optionally attach Context7 MCP for documentation lookup.
5. Let the model select tools and extract parameters from natural language.
6. Let runtime policy enforce confirmations before write actions.

## Folder Shape

```txt
local-agent/
  connections/
    customer-connections.ts # in-memory authenticated connection registry
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

The React app establishes a customer connection through `POST /connections/customer`. The local service validates and caches the contract, keeps credentials in memory, and returns a sanitized tool catalog plus an opaque connection ID. Chat and confirmation requests send that ID instead of resending customer credentials.

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
$env:VITE_STRANDS_AGENT_URL="http://127.0.0.1:8787"
npm run dev
```

The service binds to `127.0.0.1` and accepts the chat UI origins `http://localhost:5173` and `http://127.0.0.1:5173` by default. Set `STRANDS_AGENT_CORS_ORIGIN` to a comma-separated allowlist when the UI runs elsewhere.

Configure Ollama/OpenAI/Bedrock, Playwright browser automation, and Context7 from the Connections page. The terminal only needs to keep the local agent service running.

## Performance Knobs

Local Ollama tool-calling speed depends heavily on model size, CPU/GPU, and conversation history. Defaults are tuned for responsiveness:

```powershell
$env:STRANDS_MAX_TURNS="3"
$env:STRANDS_TOOL_LIMIT="6"
$env:STRANDS_PLANNER_CANDIDATES="60"
$env:STRANDS_MAX_TOKENS="6000"
$env:STRANDS_MAX_HISTORY_MESSAGES="6"
$env:OLLAMA_NUM_PREDICT="768"
$env:OLLAMA_NUM_CTX="4096"
$env:OLLAMA_KEEP_ALIVE="10m"
```

The runtime builds a compact candidate catalog from generic tool metadata, then asks the configured model for a structured tool plan. Only the validated selected schemas are given to the execution agent, avoiding prompt-specific routing rules and the cost of sending every full schema on every turn.

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

## Browser Automation

Playwright MCP is pinned as an application dependency and configured from the Connections page. You can also set defaults in the local agent process:

```powershell
$env:BROWSER_MCP_ENABLED="true"
$env:BROWSER_MCP_COMMAND="<browser-mcp-command>"
$env:BROWSER_MCP_ARGS='["arg1","arg2"]'
```

When browser automation is enabled, Strands can create and switch tabs, navigate pages, inspect visible state, and handle login/OTP or other UI-only actions. WebMCP tools remain the preferred path for direct customer app API actions.

The standard local configuration is:

```powershell
$env:BROWSER_MCP_ENABLED="true"
$env:BROWSER_MCP_COMMAND="npx"
$env:BROWSER_MCP_ARGS='["--no-install","@playwright/mcp","--browser","chrome"]'
```

No browser extension is required. Playwright opens a separate persistent browser profile, preserving the chat tab and retaining customer-app login state between runs. Ask browser-specific requests such as "open the connected website orders page" or "use the website UI to create an order".

When navigation reaches a sign-in page, the runtime pauses and returns a **Continue after sign-in** interaction to chat. The user signs in directly in the managed browser, including SSO, MFA, or OTP. Continuing retries the original URL, verifies that authentication succeeded, and keeps the resulting session in the persistent profile.

## Why This Shape

The app should not keep adding prompt-specific rules in `ChatService`.

Standard flow:

- Model: understand user text, select the right tool, fill parameters.
- Tools: expose exact app capability and schema from `webapi.json`.
- Runtime: enforce auth, confirmation, write blocking, and error boundaries.
- UI: show user-friendly progress, choices, confirmation, and results.

## Optional UI Hints

WebMCP APIs remain the primary automation path. When a user explicitly asks to
work through the website UI, a customer app can optionally publish browser hints
in `/webapi.json`:

```json
{
  "x-webmcp-ui": {
    "routes": {
      "orders": "/orders"
    },
    "actions": {
      "createOrder": {
        "route": "/orders",
        "fields": {
          "customer_name": ["Customer name"],
          "amount": ["Amount"]
        },
        "submit": ["Create order"]
      }
    }
  }
}
```

Hints are generic guidance only. The browser runtime still opens the page,
takes a snapshot, and verifies visible controls before clicking or filling.
