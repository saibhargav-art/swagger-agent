export type ExecutionMode =
  | 'api-read'
  | 'api-write'
  | 'browser-read'
  | 'browser-write'
  | 'browser-navigation'
  | 'unsupported'

export type ExecutionPlan = {
  mode: ExecutionMode
  pureBrowserNavigation: boolean
  browserWorkflow: boolean
  prefersBrowser: boolean
  writeIntent: boolean
  readIntent: boolean
}

const BROWSER_HINT = /\b(?:browser|website|site|app|portal|page|ui|url|tab|screen)\b|\b(?:from there|instead of .*tools|using the website|through the website|in the ui)\b/i
const NAVIGATION_HINT = /\b(?:open|go|goto|navigate|visit|launch|show)\b/i
const WRITE_HINT = /\b(?:approve|book|cancel|change|create|delete|fill|press|remove|select|set|submit|type|update)\b/i
const READ_HINT = /\b(?:check|compare|count|duplicate|find|get|list|read|search|show|status|view|what|which)\b/i

export function classifyExecution(message: string): ExecutionPlan {
  const text = message.trim()
  const prefersBrowser = BROWSER_HINT.test(text)
  const writeIntent = WRITE_HINT.test(text)
  const readIntent = READ_HINT.test(text)
  const navigationIntent = NAVIGATION_HINT.test(text)
  const browserWorkflow = prefersBrowser && writeIntent
  const pureBrowserNavigation = prefersBrowser && navigationIntent && !browserWorkflow

  if (pureBrowserNavigation) {
    return {
      mode: 'browser-navigation',
      pureBrowserNavigation,
      browserWorkflow: false,
      prefersBrowser,
      writeIntent,
      readIntent,
    }
  }

  if (browserWorkflow) {
    return {
      mode: 'browser-write',
      pureBrowserNavigation: false,
      browserWorkflow: true,
      prefersBrowser,
      writeIntent,
      readIntent,
    }
  }

  if (prefersBrowser && (readIntent || navigationIntent)) {
    return {
      mode: 'browser-read',
      pureBrowserNavigation: false,
      browserWorkflow: true,
      prefersBrowser,
      writeIntent,
      readIntent,
    }
  }

  if (writeIntent) {
    return {
      mode: 'api-write',
      pureBrowserNavigation: false,
      browserWorkflow: false,
      prefersBrowser,
      writeIntent,
      readIntent,
    }
  }

  if (readIntent) {
    return {
      mode: 'api-read',
      pureBrowserNavigation: false,
      browserWorkflow: false,
      prefersBrowser,
      writeIntent,
      readIntent,
    }
  }

  return {
    mode: 'unsupported',
    pureBrowserNavigation: false,
    browserWorkflow: false,
    prefersBrowser,
    writeIntent,
    readIntent,
  }
}
