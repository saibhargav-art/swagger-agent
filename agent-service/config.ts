export type LocalAgentConfig = {
  modelProvider: 'openai' | 'anthropic'
  openAiApiKey?: string
  openAiModel: string
  anthropicApiKey?: string
  anthropicModel: string
}

export function readConfig(): LocalAgentConfig {
  return {
    modelProvider: readModelProvider(),
    openAiApiKey: optionalEnv('OPENAI_API_KEY'),
    openAiModel: optionalEnv('OPENAI_MODEL') ?? 'gpt-4o-mini',
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),
    anthropicModel: optionalEnv('ANTHROPIC_MODEL') ?? 'claude-3-5-sonnet-latest',
  }
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
