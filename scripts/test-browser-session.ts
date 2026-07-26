import assert from 'node:assert/strict'

import { readConfig } from '../local-agent/config.js'
import {
  browserNavigationResult,
  captureBrowserSignIn,
  clearBrowserSessions,
  getBrowserSignInStatus,
  handlePendingBrowserMessage,
  openCustomerPageFromChat,
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

  captureBrowserSignIn(
    'closed-browser',
    [navigationStep(loginUrl)],
    { message: 'open orders', webmcpLoginUrl: loginUrl },
    config,
  )
  const freshRetry = await handlePendingBrowserMessage(
    'closed-browser',
    'open connected website orders page',
    async () => null,
  )
  assert.equal(freshRetry, null, 'A fresh navigation request must recover from a closed managed browser.')

  const liveStatus = await getBrowserSignInStatus(
    'unfinished-login',
    async () => 'http://localhost:5174/dashboard',
    async (_config, url) => ({ pageUrl: url }),
  )
  assert.deepEqual(liveStatus, { state: 'authenticated', pageUrl: ordersUrl })
  const resolvedStatus = await getBrowserSignInStatus('unfinished-login', async () => ordersUrl)
  assert.deepEqual(resolvedStatus, { state: 'none' })

  const completed = browserNavigationResult([navigationStep(ordersUrl)])
  assert.equal(completed?.content, `Opened ${ordersUrl} in the managed browser.`)

  const directNavigation = await openCustomerPageFromChat(
    {
      ...config,
      browserMcpEnabled: false,
      browserMcpCommand: undefined,
    },
    {
      message: 'can you open connected website orders page',
      webmcpBaseUrl: 'http://localhost:5174',
      webmcpLoginUrl: loginUrl,
    },
  )
  assert.equal(directNavigation?.content, 'Browser automation is not configured for the local agent.')

  const mixedBrowserTask = await openCustomerPageFromChat(
    config,
    {
      message: 'can you open connected website and create order from there instead of doing it here from tools',
      webmcpBaseUrl: 'http://localhost:5174',
      webmcpLoginUrl: loginUrl,
    },
  )
  assert.equal(mixedBrowserTask, null, 'Mixed browser tasks must go through the agent planner, not route slugging.')

  console.log('Browser session regression tests passed.')
} finally {
  clearBrowserSessions()
}
