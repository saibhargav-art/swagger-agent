# Agent Runtime Boundary

The chat UI should talk to an `AgentRuntime`, not directly to Strands, Playwright MCP, or WebMCP orchestration code.

Current implementation:

- `strands-local`: Node-side Strands agent in `local-agent/`.

This boundary keeps the UI stable while orchestration moves to a desktop/local service.
