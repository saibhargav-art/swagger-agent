# AI Chat App

Single React application for AI chat plus customer website tool execution.

The app connects to:

- a local Strands agent service that owns model/tool orchestration
- a customer website that hosts `/webapi.json`
- an authenticated customer API session, passed as a bearer token
- a separate persistent Playwright browser session for visible customer pages

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

The Strands runtime loads WebMCP tools, can attach Playwright MCP for a separate persistent browser, and lets the model choose tools and parameters. Runtime policy still blocks write actions unless `ALLOW_WEBMCP_WRITES=true` is set.

To route the React chat through the local Strands HTTP service:

```bash
npm run agent:server
VITE_STRANDS_AGENT_URL=http://127.0.0.1:8787 npm run dev
```

Select Ollama/OpenAI/Bedrock from the Connections page. Customer credentials are sent once to the loopback-only local service; chat requests use an opaque local connection ID.

## Connection Flow

1. Open `Connections`.
2. Select the local model provider and model. Ollama runs locally; OpenAI needs an API key; Bedrock uses the local AWS environment.
3. Enter the customer app URL that publishes `/webapi.json`.
4. Paste the logged-in customer's access token and select **Connect all**.
5. Verify the discovered tools, then use chat for customer-app actions.

Service URLs, an optional customer sign-in route, and managed-browser settings live under **Advanced settings**. They normally keep their defaults.
The managed browser starts lazily on the first browser-only request, so connecting the local agent does not open an empty browser window.

For browser-only pages, Playwright uses a separate persistent profile. If the customer app redirects to sign-in, complete login in that managed browser and select **Continue after sign-in** in chat. The agent verifies the session and resumes the originally requested page. Passwords, MFA codes, and OTPs never pass through the chat app.

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

`servers[0].url` is the backend that executes tools. The website URL is only used for discovery.

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
  models/
  runtime/
  tools/
```

## Tool Execution UX

The local Strands agent decides which tools to call and what parameters to use. The chat UI does not perform manual tool matching or show raw JSON. Users see plain language responses and structured confirmation cards for write actions:

- read actions execute directly
- write actions require Confirm/Cancel in the app
- results are summarized in plain language

## Security Model

The local agent loads `/webapi.json`, keeps the customer token in memory, and forwards it only to the declared tool backend. The static contract describes capabilities; it is not an authorization authority.

The customer backend must verify every tool call:

- valid user session
- allowed role
- required scope
- business permission
- request body validation
