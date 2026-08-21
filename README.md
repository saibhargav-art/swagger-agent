# AI Chat App

Single React application for AI chat plus customer website tool execution.

The app connects to:

- a local Strands agent service that owns model/tool orchestration
- a customer website that exposes WebMCP capabilities
- an authenticated customer API session, passed as a bearer token

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

## Local Strands Agent

The Node-side Strands runtime in `local-agent/` is the only orchestration service. Start it before the React app:

```bash
npm run agent:server
VITE_STRANDS_AGENT_URL=http://127.0.0.1:8787 npm run dev
```

Select OpenAI or Claude from the Connections page. Customer credentials are sent once to the loopback-only local service; chat requests use an opaque local connection ID.

## Connection Flow

1. Open `Connections`.
2. Select OpenAI or Claude and enter the provider API key.
3. Enter the customer app URL that exposes WebMCP capabilities.
4. Paste the logged-in customer's access token and select **Connect all**.
5. Verify the discovered tools, then use chat for customer-app actions.

The agent service URL lives under **Advanced settings**. Browser automation is intentionally disabled in this branch so the demo remains fast and tool-focused.

## Customer Contract

The customer app should expose WebMCP capabilities and secure backend endpoints. Capabilities can come from declarative markup, imperative registration, or an optional contract file for compatibility.

Optional `webapi.json` compatibility shape:

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
  "security": [{ "bearerAuth": [] }],
  "paths": {
    "/action-name": {
      "post": {
        "operationId": "performAction",
        "summary": "Perform an app action",
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
        },
        "responses": {
          "200": { "description": "Action completed" }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      }
    }
  }
}
```

`servers[0].url` is the backend that executes tools when a contract file is used. The website URL is used for discovery.

## Folder Structure

```txt
src/
  components/
    chat/
    connections/
    layout/
    tools/
    ui/
  hooks/
  pages/
    ChatPage/
    ConnectionsPage/
  services/
    chat/
    connections/
    runtime/
  store/
  types/
  utils/
local-agent/
  connections/
  runtime/
  tools/
```

## Tool Execution UX

The local Strands agent decides which tools to call and what parameters to use. The chat UI does not perform manual tool matching or show raw JSON. Users see plain language responses and structured confirmation cards for write actions:

- read actions execute directly
- write actions require Confirm/Cancel in the app
- results are summarized in plain language

## Security Model

The local agent discovers WebMCP capabilities, keeps the customer token in memory, and forwards it only to the declared customer backend. The exposed capability metadata describes what the app can do; it is not an authorization authority.

The customer backend must verify every tool call:

- valid user session
- allowed role
- required scope
- business permission
- request body validation
