export type LocalAgentConfig = {
  prompt: string
  modelProvider: 'openai' | 'anthropic'
  webmcpBaseUrl?: string
  webmcpBearerToken?: string
  webmcpAuthHeader?: string
  webmcpAuthValue?: string
  allowWebMcpWrites: boolean
  openAiApiKey?: string
  openAiModel: string
  anthropicApiKey?: string
  anthropicModel: string
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
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),
    anthropicModel: optionalEnv('ANTHROPIC_MODEL') ?? 'claude-3-5-sonnet-latest',
  }
}

export function printUsage(): void {
  console.log(`Usage:
  npm run agent:poc -- "your request"

Required for customer app tools:
  WEBMCP_BASE_URL=http://localhost:5173
  WEBMCP_BEARER_TOKEN=<logged-in user token>

Optional:
  OPENAI_API_KEY=<key>                 OpenAI API key
  OPENAI_MODEL=gpt-4o-mini
  STRANDS_MODEL_PROVIDER=anthropic     Use Claude instead of OpenAI
  ANTHROPIC_API_KEY=<key>
  ANTHROPIC_MODEL=claude-3-5-sonnet-latest
  ALLOW_WEBMCP_WRITES=true             Allow create/update/delete API calls
`)
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function readModelProvider(): LocalAgentConfig['modelProvider'] {
  const value = optionalEnv('STRANDS_MODEL_PROVIDER')
  if (value === 'openai' || value === 'anthropic') return value
  return 'openai'
}
