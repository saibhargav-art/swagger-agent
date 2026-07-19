import type { LocalAgentConfig } from '../config.js'
import { navigateWithBrowserMcp, type BrowserMcpConfig } from '../tools/mcp-clients.js'
import { isApproval, isCancellation } from './confirmation.js'
import { isSuccessfulToolResult, toolResultText } from './agent-trace.js'
import type { AgentTraceStep, ConfirmPendingActionInput, RunAgentInput, RunAgentResult } from './types.js'

const SIGN_IN_TTL_MS = 10 * 60 * 1000
const pendingSignIns = new Map<string, PendingBrowserSignIn>()

type PendingBrowserSignIn = {
  destinationUrl: string
  signInUrl: string
  protectedOrigin?: string
  browserConfig: BrowserMcpConfig
  createdAt: number
}

export async function handlePendingBrowserMessage(
  conversationId: string,
  message: string,
): Promise<RunAgentResult | null> {
  const pending = getPendingSignIn(conversationId)
  if (!pending) return null

  if (isCancellation(message)) {
    return resolvePendingBrowserSignIn({ conversationId, approved: false })
  }
  if (isApproval(message) || /^(?:continue|done|signed\s+in|logged\s+in|ready)$/i.test(message.trim())) {
    return resolvePendingBrowserSignIn({ conversationId, approved: true })
  }

  return signInRequiredResult(
    conversationId,
    pending,
    'browser_navigate',
    'Sign-in is waiting in the managed browser. Complete it and continue, or cancel this request.',
  )
}

export function captureBrowserSignIn(
  conversationId: string,
  trace: AgentTraceStep[],
  input: RunAgentInput,
  config: LocalAgentConfig,
): RunAgentResult | null {
  const latest = latestBrowserPageStep(trace)
  if (!latest) return null

  const pageUrl = extractPageUrl(latest.result)!
  if (!isSignInPage(pageUrl, input.webmcpLoginUrl)) {
    pendingSignIns.delete(conversationId)
    return null
  }

  const requestedUrl = browserRequestUrl(latest.input) ?? input.browserStartUrl ?? input.webmcpBaseUrl
  if (!requestedUrl || isSignInPage(requestedUrl, input.webmcpLoginUrl)) return null

  const pending: PendingBrowserSignIn = {
    destinationUrl: requestedUrl,
    signInUrl: pageUrl,
    protectedOrigin: input.chatAppUrl,
    browserConfig: browserConfigFrom(config),
    createdAt: Date.now(),
  }
  pendingSignIns.set(conversationId, pending)
  return signInRequiredResult(conversationId, pending, latest.name)

}

export function browserNavigationResult(trace: AgentTraceStep[]): RunAgentResult | null {
  const step = [...trace].reverse().find((candidate) => isBrowserNavigationStep(candidate))
  if (!step) return null

  const requestedUrl = browserRequestUrl(step.input)
  const pageUrl = extractPageUrl(step.result)
  if (!step.ok) {
    return {
      content: `Browser automation could not open ${requestedUrl ?? 'the requested page'}. ${toolResultText(step.result)}`,
      stopReason: 'endTurn',
      trace,
    }
  }

  const destination = pageUrl ?? requestedUrl
  return {
    content: destination
      ? `Opened ${destination} in the managed browser.`
      : 'The requested page was opened in the managed browser.',
    stopReason: 'endTurn',
    trace,
  }

}

export async function resolvePendingBrowserSignIn(
  input: Pick<ConfirmPendingActionInput, 'conversationId' | 'approved'>,
): Promise<RunAgentResult | null> {
  const sessionId = input.conversationId.trim() || 'default'
  const pending = getPendingSignIn(sessionId)
  if (!pending) return null

  if (!input.approved) {
    pendingSignIns.delete(sessionId)
    return { content: 'Cancelled browser sign-in. The requested page was not opened.', stopReason: 'endTurn', trace: [] }
  }

  try {
    const result = await navigateWithBrowserMcp(pending.browserConfig, pending.destinationUrl, {
      protectedOrigin: pending.protectedOrigin,
    })
    const ok = isSuccessfulToolResult(result.result)
    const stillNeedsSignIn = Boolean(result.pageUrl && isSignInPage(result.pageUrl, pending.signInUrl))

    if (!ok || stillNeedsSignIn) {
      if (result.pageUrl) pending.signInUrl = result.pageUrl
      return signInRequiredResult(
        sessionId,
        pending,
        result.toolName,
        ok
          ? 'Sign-in is not complete. Finish signing in in the managed browser, then continue.'
          : `The browser session could not be verified. ${toolResultText(result.result)}`,
      )
    }

    pendingSignIns.delete(sessionId)
    const redirected = result.pageUrl && !sameUrl(result.pageUrl, pending.destinationUrl)
    return {
      content: redirected
        ? `Sign-in verified. The customer app opened ${result.pageUrl}.`
        : `Sign-in verified. Opened ${pending.destinationUrl} in the managed browser.`,
      stopReason: 'endTurn',
      trace: [{
        type: 'tool',
        name: result.toolName,
        input: { url: pending.destinationUrl },
        result: { destination: result.pageUrl ?? pending.destinationUrl, state: 'Authenticated' },
        ok: true,
        status: 'success',
      }],
    }
  } catch (error) {
    return signInRequiredResult(
      sessionId,
      pending,
      'browser_navigate',
      `The browser session could not be verified. ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function clearBrowserSessions(): void {
  pendingSignIns.clear()
}

function signInRequiredResult(
  conversationId: string,
  pending: PendingBrowserSignIn,
  toolName: string,
  content = 'The customer app requires sign-in. Complete it in the managed browser, then continue here.',
): RunAgentResult {
  return {
    content,
    stopReason: 'endTurn',
    trace: [{
      type: 'tool',
      name: toolName,
      input: { url: pending.destinationUrl },
      result: { destination: pending.signInUrl, state: 'Sign-in required' },
      ok: true,
      status: 'attention',
    }],
    confirmationRequired: {
      runId: conversationId,
      toolName: 'browser_sign_in',
      kind: 'browser-login',
      title: 'Sign in required',
      details: { requestedPage: pending.destinationUrl, signInPage: pending.signInUrl },
      confirmLabel: 'Continue after sign-in',
      cancelLabel: 'Cancel',
    },
  }
}

function getPendingSignIn(conversationId: string): PendingBrowserSignIn | undefined {
  const pending = pendingSignIns.get(conversationId)
  if (!pending) return undefined
  if (Date.now() - pending.createdAt <= SIGN_IN_TTL_MS) return pending
  pendingSignIns.delete(conversationId)
  return undefined
}

function browserConfigFrom(config: LocalAgentConfig): BrowserMcpConfig {
  return {
    browserMcpEnabled: config.browserMcpEnabled,
    browserMcpCommand: config.browserMcpCommand,
    browserMcpArgs: [...config.browserMcpArgs],
  }
}

function browserRequestUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const url = (value as Record<string, unknown>).url
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}

function latestBrowserPageStep(trace: AgentTraceStep[]): AgentTraceStep | undefined {
  return [...trace].reverse().find((step) => (
    step.ok
    && /^browser_/i.test(step.name)
    && Boolean(extractPageUrl(step.result))
  ))
}

function isBrowserNavigationStep(step: AgentTraceStep): boolean {
  if (/^browser_(?:navigate|open)$/i.test(step.name)) return true
  if (step.name !== 'browser_tabs' || !step.input || typeof step.input !== 'object' || Array.isArray(step.input)) {
    return false
  }
  return (step.input as Record<string, unknown>).action === 'new'
}

function extractPageUrl(result: unknown): string | null {
  return toolResultText(result).match(/(?:Page URL:|\]\()\s*(https?:\/\/[^\s)]+)/i)?.[1] ?? null
}

function sameUrl(left: string, right: string): boolean {
  try {
    return new URL(left).href.replace(/\/$/, '') === new URL(right).href.replace(/\/$/, '')
  } catch {
    return left === right
  }
}

function isSignInPage(pageUrl: string, configuredSignInUrl?: string): boolean {
  try {
    if (/(?:^|\/)(?:login|log-in|signin|sign-in|auth)(?:\/|$)/i.test(new URL(pageUrl).pathname)) return true
  } catch {
    if (/\b(?:login|log-in|signin|sign-in|auth)\b/i.test(pageUrl)) return true
  }
  return Boolean(configuredSignInUrl && sameUrl(pageUrl, configuredSignInUrl))
}
