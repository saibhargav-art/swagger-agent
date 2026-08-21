# Agent Runtime Boundary

The chat UI talks to an `AgentRuntime`, never directly to Strands or WebMCP orchestration code.

Current implementation:

- `strands-local`: the tools-only Node Strands service in `local-agent/`.

This boundary keeps provider selection, planning, tool execution, and confirmation outside the React application.
