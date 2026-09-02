# WebMCP Browser Assistant

A generic browser assistant with two independent parts:

- `extension/`: a WXT and SolidJS side panel that discovers and executes WebMCP tools on the active webpage
- `agent-service/`: a local Strands HTTP service that selects tools and extracts their inputs

The extension does not collect customer access tokens. Tool callbacks run in the webpage, so the customer application continues to own its login session, authorization checks, and backend calls.

## Run

Create `agent-service/.env` from `agent-service/.env.example`, add an OpenAI or Anthropic API key, then run:

```powershell
npm install
npm run agent
```

In another terminal:

```powershell
npm run extension
```

Load `extension/.output/chrome-mv3-dev` as an unpacked Chrome or Edge extension. Open a signed-in WebMCP-enabled webpage and click the extension icon.

## Flow

```text
Active webpage registers WebMCP tools
              |
              v
Extension discovers tool metadata
              |
              v
User prompt -> Strands agent service
              |
              v
Strands requests a tool invocation
              |
              v
Extension confirms writes and asks the webpage to execute
              |
              v
Webpage uses its own session and backend
              |
              v
Result returns to Strands and the side panel
```

Read tools run immediately. The first call to a data-changing tool requires confirmation in the side panel. That approval is scoped to the same tool and prompt, allowing Strands to orchestrate bounded multi-record operations without repeatedly prompting. Each prompt remains bound to the browser tab where it started.

## Commands

```powershell
npm run check
npm run build
npm run extension -- --browser firefox
```

Chrome and Edge use the same side-panel implementation. WXT generates a Firefox sidebar build from the shared source.
