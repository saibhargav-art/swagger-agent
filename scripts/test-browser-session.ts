import assert from 'node:assert/strict'

import { readConfig } from '../local-agent/config.js'
import {
  browserNavigationResult,
  captureBrowserSignIn,
  clearBrowserSessions,
} from '../local-agent/runtime/browser-session.js'
import type { AgentTraceStep } from '../local-agent/runtime/types.js'

const ordersUrl = 'http://localhost:5174/orders'
const loginUrl = 'http://localhost:5174/login'
const config = readConfig([])

function navigationStep(pageUrl: string): AgentTraceStep {
  return {
    type: 'tool',
    name: 'browser_navigate',
    input: { url: ordersUrl },
    result: {
      content: [{ type: 'text', text: `### Page\n- Page URL: ${pageUrl}` }],
    },
    ok: true,
  }
}

try {
  const staleLogin = captureBrowserSignIn(
    'stale-login',
    [navigationStep(loginUrl), navigationStep(ordersUrl)],
    { message: 'open orders', webmcpLoginUrl: loginUrl },
    config,
  )
  assert.equal(staleLogin, null, 'A newer authenticated page must supersede an older login redirect.')

  const activeLogin = captureBrowserSignIn(
    'active-login',
    [navigationStep(loginUrl)],
    { message: 'open orders', webmcpLoginUrl: loginUrl },
    config,
  )
  assert.equal(activeLogin?.confirmationRequired?.kind, 'browser-login')
  assert.equal(activeLogin?.confirmationRequired?.details.requestedPage, ordersUrl)

  const completed = browserNavigationResult([navigationStep(ordersUrl)])
  assert.equal(completed?.content, `Opened ${ordersUrl} in the managed browser.`)

  console.log('Browser session regression tests passed.')
} finally {
  clearBrowserSessions()
}
