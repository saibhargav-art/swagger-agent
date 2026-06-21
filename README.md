# swagger-agent

A lightweight AI chat application with WebMCP tool discovery and execution.

Supports **OpenAI**, **Claude**, **Gemini**, and **Ollama** out of the box.

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Configuration

### 1. Set your AI provider

Go to **Settings** (`/settings`) and enter your API key for the provider you want to use, then select it as the active provider.

| Provider | Needs          | Notes                                 |
|----------|----------------|---------------------------------------|
| OpenAI   | API key        | Direct browser calls supported        |
| Claude   | API key + proxy| Requires a CORS proxy (see below)     |
| Gemini   | API key        | Direct browser calls supported        |
| Ollama   | Local server   | Run `ollama serve` locally            |

### 2. Environment variables (optional)

Create a `.env` file in the project root:

```env
# Point to a real WebMCP server (leave unset to use mock tools)
VITE_WEBMCP_BASE_URL=http://localhost:8080

# Claude proxy URL (needed to bypass CORS in the browser)
VITE_CLAUDE_PROXY_URL=http://localhost:3001
```

---

## Architecture

```
src/
├── pages/            # Route-level page components
│   ├── ChatPage/     # Three-column chat interface
│   ├── ToolExplorerPage/  # Browse & inspect tools
│   └── SettingsPage/ # Provider configuration
│
├── components/
│   ├── chat/         # MessageList, MessageBubble, ChatInput, ChatPanel
│   ├── tools/        # ToolExplorer, ToolCard, ToolDetails
│   ├── activity/     # ToolActivityPanel
│   ├── providers/    # ProviderSelector
│   ├── layout/       # NavSidebar, ConversationList, AppLayout
│   └── ui/           # Reusable primitives (Button, Input, Badge…)
│
├── providers/        # AI provider implementations
│   ├── openai/
│   ├── claude/
│   ├── gemini/
│   └── ollama/
│
├── services/
│   ├── ai/           # ProviderManager, ChatService (streaming + tool calls)
│   └── webmcp/       # WebMCPService (getTools / executeTool)
│
├── store/            # Zustand stores (chat, provider, tool)
├── hooks/            # useChat, useTools
├── types/            # Shared TypeScript types
└── utils/            # cn, format helpers
```

---

## Tool Call Format

The system prompt instructs the AI to emit tool calls using XML tags:

```
<tool_call>{"tool": "createOrder", "params": {"customerName": "Vijay", "amount": 50}}</tool_call>
```

`ChatService` parses the response, executes the tool via `WebMCPService`, and updates the message bubble with the result — all without any UI-side business logic.

---

## WebMCP Integration

`WebMCPService` is the only integration point. It now supports two discovery modes:

- OpenAPI-based discovery from a spec file such as `/webmcp-openapi.json`
- Remote WebMCP discovery via a `/tools` endpoint fallback

The service also executes tools directly from OpenAPI definitions when available, or via a remote `/execute` endpoint if the server exposes one.

```ts
// src/services/webmcp/WebMCPService.ts

async getTools(): Promise<Tool[]> {
  const spec = await this.fetchOpenApiSpec();
  return spec ? this.parseToolsFromSpec(spec) : this.fetchToolsEndpoint();
}

async executeTool(toolName: string, params: Record<string, unknown>) {
  const definition = this.toolDefinitions.get(toolName);
  if (definition) {
    return this.executeOpenApiTool(definition, params);
  }
  return this.executeRemoteTool(toolName, params);
}
```

The rest of the application is not affected.

---

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — build tool
- **Tailwind CSS** — styling
- **Zustand** — state management (with `localStorage` persistence)
- **React Router v6** — routing
- **Lucide React** — icons
