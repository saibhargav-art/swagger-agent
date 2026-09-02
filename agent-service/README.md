# Strands Agent Service

This loopback HTTP service is the assistant's reasoning runtime. It receives a prompt and the active page's WebMCP tool metadata. It does not discover customer contracts, retain customer tokens, or call customer backends.

The service exposes:

- `GET /health`: runtime status
- `GET /events?sessionId=...`: browser tool requests over server-sent events
- `POST /chat`: prompt and current tool metadata
- `POST /tool-results`: result returned by the browser extension

When Strands invokes a tool, the callback sends a request to the extension and waits. The extension executes that tool in the webpage and returns the result, allowing the same Strands invocation to produce the final response.

The runtime executes tools sequentially and limits data-changing calls per prompt. The default is 20 and can be configured with `STRANDS_MAX_WRITE_CALLS`. Approval is owned by the extension and is scoped to one tool within one prompt.

## Configuration

Copy `.env.example` to `.env`, or set the variables in the shell before starting the service. Supported providers are OpenAI and Anthropic.

```powershell
$env:STRANDS_MODEL_PROVIDER="openai"
$env:OPENAI_API_KEY="<key>"
$env:OPENAI_MODEL="gpt-4o-mini"
npm run dev
```

The service binds to `127.0.0.1:8787` by default. It accepts extension origins and loopback development origins only.
