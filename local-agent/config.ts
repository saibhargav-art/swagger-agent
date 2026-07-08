export type LocalAgentConfig = {
  prompt: string
  modelProvider: 'openai' | 'ollama' | 'bedrock'
  webmcpBaseUrl?: string
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
  allowWebMcpWrites: boolean
  openAiApiKey?: string
  openAiModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  browserMcpCommand?: string
  browserMcpArgs: string[]
  context7Enabled: boolean
  context7Command: string
  context7Args: string[]
}

export function readConfig(argv: string[] = process.argv.slice(2)): LocalAgentConfig {
  const prompt = argv.join(' ').trim()

  return {
    prompt,
    modelProvider: readModelProvider(),
    webmcpBaseUrl: optionalEnv('WEBMCP_BASE_URL'),
    webmcpBearerToken: optionalEnv('WEBMCP_BEARER_TOKEN'),
    webmcpAuthHeader: optionalEnv('WEBMCP_AUTH_HEADER'),
    webmcpAuthValue: optionalEnv('WEBMCP_AUTH_VALUE'),
    allowWebMcpWrites: process.env.ALLOW_WEBMCP_WRITES === 'true',
    openAiApiKey: optionalEnv('OPENAI_API_KEY'),
    openAiModel: optionalEnv('OPENAI_MODEL') ?? 'gpt-4o-mini',
    ollamaBaseUrl: optionalEnv('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434',
    ollamaModel: optionalEnv('OLLAMA_MODEL') ?? 'qwen2.5:7b',
    browserMcpCommand: optionalEnv('BROWSER_MCP_COMMAND'),
    browserMcpArgs: parseArgs(optionalEnv('BROWSER_MCP_ARGS')),
    context7Enabled: process.env.CONTEXT7_MCP_ENABLED === 'true',
    context7Command: optionalEnv('CONTEXT7_MCP_COMMAND') ?? 'npx',
    context7Args: parseArgs(optionalEnv('CONTEXT7_MCP_ARGS')) ?? ['-y', '@upstash/context7-mcp'],
  }
}

export function printUsage(): void {
  console.log(`Usage:
  npm run agent:poc -- "your request"

Required for customer app tools:
  WEBMCP_BASE_URL=http://localhost:5173
  WEBMCP_BEARER_TOKEN=<logged-in user token>

Optional:
  OPENAI_API_KEY=<key>                 Use OpenAI instead of default Bedrock config
  OPENAI_MODEL=gpt-4o-mini
  STRANDS_MODEL_PROVIDER=ollama        Use local Ollama instead of OpenAI/Bedrock
  OLLAMA_BASE_URL=http://127.0.0.1:11434
  OLLAMA_MODEL=qwen2.5:7b
  ALLOW_WEBMCP_WRITES=true             Allow create/update/delete API calls
  BROWSER_MCP_COMMAND=<command>        Enable browser MCP server
  BROWSER_MCP_ARGS='["arg1","arg2"]'
  CONTEXT7_MCP_ENABLED=true            Enable Context7 MCP
`)
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function readModelProvider(): LocalAgentConfig['modelProvider'] {
  const value = optionalEnv('STRANDS_MODEL_PROVIDER')
  if (value === 'openai' || value === 'ollama' || value === 'bedrock') return value
  return 'ollama'
}

function parseArgs(value?: string): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Fall through to shell-like splitting for simple local use.
  }

  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? []
}
