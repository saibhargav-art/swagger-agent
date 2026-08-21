# Strands Local Agent

This folder is the local runtime used by the React chat UI. It runs outside the browser and exposes a small HTTP API.

The current branch is intentionally tools-only:

1. Connect a customer app that exposes WebMCP tools.
2. Convert those capabilities into Strands function tools.
3. Let OpenAI or Claude select the right tool and fill parameters.
4. Execute read tools directly.
5. Pause write tools for explicit user confirmation in chat.

Browser automation is not active in this branch. That keeps the demo fast and prevents browser session or selector issues from affecting tool execution.

## Folder Shape

```txt
local-agent/
  connections/
    customer-connections.ts # in-memory authenticated connection registry
  runtime/
    agent-trace.ts      # trace extraction and tool result helpers
    confirmation.ts     # text confirmation helpers
    tool-planner.ts     # model-assisted tool selection
    tool-policy.ts      # tool narrowing policy
    types.ts            # HTTP runtime types
  tools/
    webmcp-tools.ts     # WebMCP capability conversion
  agent-runtime.ts      # Strands orchestration
  server.ts             # local HTTP bridge for the React app
  strands-agent.ts      # CLI entry point
  config.ts             # environment/runtime config
```

The React app establishes a customer connection through `POST /connections/customer`. The local service validates and caches the contract, keeps credentials in memory, and returns a sanitized tool catalog plus an opaque connection ID. Chat and confirmation requests send that ID instead of resending full customer details.

## Run

```powershell
npm run agent:server
```

Then start the React app:

```powershell
npm run dev
```

The service binds to `127.0.0.1:8787` by default and accepts local Vite origins. Set `STRANDS_AGENT_CORS_ORIGIN` to a comma-separated allowlist when the UI runs elsewhere.

## Model Providers

Configure the provider from the Connections page, or use environment defaults:

```powershell
$env:STRANDS_MODEL_PROVIDER="openai"
$env:OPENAI_API_KEY="<key>"
$env:OPENAI_MODEL="gpt-4o-mini"
```

For Claude:

```powershell
$env:STRANDS_MODEL_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="<key>"
$env:ANTHROPIC_MODEL="claude-3-5-sonnet-latest"
```

## Performance Knobs

Runtime defaults are tuned for responsive tool planning and execution:

```powershell
$env:STRANDS_MAX_TURNS="3"
$env:STRANDS_TOOL_LIMIT="6"
$env:STRANDS_PLANNER_CANDIDATES="60"
$env:STRANDS_MAX_TOKENS="6000"
$env:STRANDS_MAX_HISTORY_MESSAGES="6"
```

The runtime builds a compact candidate catalog from generic tool metadata, asks the configured model for a structured tool plan, and sends only the selected tool schemas to the execution agent.

For timing logs:

```powershell
$env:STRANDS_DEBUG_TIMING="true"
npm run agent:server
```

## Why This Shape

The chat UI stays thin. It handles connection state, user messages, confirmations, and display. The local runtime owns model-assisted tool selection, parameter extraction, write blocking, and error boundaries.

Customer app authorization still belongs to the customer backend. Every tool endpoint must validate session, role, scope, and request body.
