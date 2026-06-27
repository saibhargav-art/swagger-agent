# AI Chat App

Single React application for AI chat plus customer website tool execution.

The app connects to:

- an AI provider: OpenAI, Claude, Gemini, or Ollama
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

## Connection Flow

1. Open `Connections`.
2. Configure and test one AI provider.
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
    providers/
    tools/
    ui/
  context/
  hooks/
  pages/
    ChatPage/
    ConnectionsPage/
  providers/
    claude/
    gemini/
    ollama/
    openai/
  services/
    ai/
    webmcp/
  store/
  types/
  utils/
  webmcp/
```

## Tool Execution UX

The AI may emit a hidden tool payload internally, but the chat UI does not show raw JSON. Users see structured execution states:

- found tool
- executing tool
- success or permission/session error
- concise result preview

## Security Model

The chat app verifies that `/webapi.json` can be loaded and forwards auth to the tool backend.

The customer backend must verify every tool call:

- valid user session
- allowed role
- required scope
- business permission
- request body validation
