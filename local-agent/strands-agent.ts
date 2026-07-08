import { printUsage, readConfig } from './config.js'
import { runAgent, shutdownAgents } from './agent-runtime.js'

const config = readConfig()

if (!config.prompt) {
  printUsage()
  process.exit(0)
}

try {
  const result = await runAgent(config, { message: config.prompt })
  console.log(result.content)
} finally {
  await shutdownAgents()
}
