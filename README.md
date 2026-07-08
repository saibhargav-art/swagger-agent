# AI Chat App

Single React application for AI chat plus customer website tool execution.

The app connects to:

- a local Strands agent service that owns model/tool orchestration
- a customer website that hosts `/webapi.json`
- an authenticated customer user session, passed as bearer token or browser session cookies

The customer backend remains the source of truth for login, roles, scopes, and permissions.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production Build

```bash
npm run build
npm run preview
```

## Local Strands Agent POC

This branch uses a Node-side Strands runtime in `local-agent/`.

Use it to test the standard agent flow without disturbing the React chat app:

```bash
npm run agent:poc -- "list the available customer actions"
```

With a customer website connected by `/webapi.json`:

```bash
WEBMCP_BASE_URL=http://localhost:5173 WEBMCP_BEARER_TOKEN=<token> npm run agent:poc -- "search orders for vijay"
```

The Strands runtime loads WebMCP tools, can attach Browser MCP, and lets the model choose tools and parameters. Runtime policy still blocks write actions unless `ALLOW_WEBMCP_WRITES=true` is set.

To route the React chat through the local Strands HTTP service:

```bash
npm run agent:server
VITE_STRANDS_AGENT_URL=http://localhost:8787 npm run dev
```

Select Ollama/OpenAI/Bedrock from the Connections page. The browser sends only the selected model settings to the local Strands service per request.

## Connection Flow

1. Open `Connections`.
2. Configure and test the local Strands agent.
3. Enter the customer login URL and sign in.
4. Enter the website URL that hosts `/webapi.json`.
5. Choose auth mode:
   - `Bearer token`: paste the logged-in user's access token.
   - `Browser session`: send cookies with tool calls. The customer backend must allow CORS credentials.
6. Connect the website and verify discovered tools.
7. Use chat for actions such as creating an order or checking order status.

## Customer Contract

The customer app only needs to host a JSON contract and secure backend endpoints.

Minimum `webapi.json` shape:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Customer Tools",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://api.customer.com"
    }
  ],
  "paths": {
    "/action-name": {
      "post": {
        "operationId": "performAction",
        "summary": "Perform an app action",
        "x-webmcp-scopes": ["scope:write"],
        "x-webmcp-roles": ["member", "admin"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["field_name"],
                "properties": {
                  "field_name": { "type": "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

`servers[0].url` is the backend that executes tools. The website URL is only used for discovery.

## Folder Structure

```txt
src/
  components/
    activity/
    chat/
    layout/
    tools/
    ui/
  context/
  hooks/
  pages/
    ChatPage/
    ConnectionsPage/
  services/
    ai/
    runtime/
    webmcp/
  store/
  types/
  utils/
  webmcp/
```

## Tool Execution UX

The local Strands agent decides which tools to call and what parameters to use. The chat UI does not perform manual tool matching or show raw JSON. Users see plain language responses and structured confirmation cards for write actions:

- read actions execute directly
- write actions require Confirm/Cancel in the app
- results are summarized in plain language

## Security Model

The chat app verifies that `/webapi.json` can be loaded and forwards auth to the tool backend.

The customer backend must verify every tool call:

- valid user session
- allowed role
- required scope
- business permission
- request body validation
