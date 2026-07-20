import assert from 'node:assert/strict'

import { readConfig } from '../local-agent/config.js'
import {
  browserNavigationResult,
  captureBrowserSignIn,
  clearBrowserSessions,
  getBrowserSignInStatus,
  handlePendingBrowserMessage,
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

  const reconciled = await handlePendingBrowserMessage(
    'active-login',
    'go to the admin page',
    async () => ordersUrl,
  )
  assert.equal(reconciled, null, 'An authenticated customer page must release the next normal request.')

  captureBrowserSignIn(
    'unfinished-login',
    [navigationStep(loginUrl)],
    { message: 'open orders', webmcpLoginUrl: loginUrl },
    config,
  )
  const stillWaiting = await handlePendingBrowserMessage(
    'unfinished-login',
    'go to the admin page',
    async () => loginUrl,
  )
  assert.equal(stillWaiting?.confirmationRequired?.kind, 'browser-login')

  const liveStatus = await getBrowserSignInStatus('unfinished-login', async () => ordersUrl)
  assert.deepEqual(liveStatus, { state: 'authenticated', pageUrl: ordersUrl })
  const resolvedStatus = await getBrowserSignInStatus('unfinished-login', async () => ordersUrl)
  assert.deepEqual(resolvedStatus, { state: 'none' })

  const completed = browserNavigationResult([navigationStep(ordersUrl)])
  assert.equal(completed?.content, `Opened ${ordersUrl} in the managed browser.`)

  console.log('Browser session regression tests passed.')
} finally {
  clearBrowserSessions()
}
