import type { Tool } from '@strands-agents/sdk'

const DEFAULT_TOOL_LIMIT = 6
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'can', 'could', 'do', 'for', 'from', 'has', 'have',
  'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'that', 'the',
  'there', 'this', 'to', 'we', 'with', 'would', 'you',
])
const READ_TERMS = new Set([
  'check', 'compare', 'count', 'duplicate', 'find', 'get', 'list', 'read', 'search',
  'show', 'status', 'view', 'what', 'which',
])
const WRITE_TERMS = new Set([
  'add', 'approve', 'cancel', 'change', 'create', 'delete', 'fulfil', 'remove', 'set',
  'submit', 'update',
])
const BROWSER_TERMS = new Set([
  'browser', 'click', 'fill', 'form', 'login', 'navigate', 'open', 'page', 'press',
  'screen', 'select', 'tab', 'type', 'ui', 'website',
])

export type ToolSelection = {
  tools: Tool[]
  names: string[]
}

export function selectToolsForMessage(
  availableTools: Tool[],
  message: string,
  previousToolNames: string[] = [],
  limit = Number(process.env.STRANDS_TOOL_LIMIT ?? DEFAULT_TOOL_LIMIT),
): ToolSelection {
  const queryTokens = tokenize(message)
  const browserIntent = intersects(queryTokens, BROWSER_TERMS)
  const readIntent = intersects(queryTokens, READ_TERMS)
  const writeIntent = intersects(queryTokens, WRITE_TERMS)
  const previous = new Set(previousToolNames)

  const ranked = availableTools
    .map((tool, index) => ({
      tool,
      index,
      score: scoreTool(tool, queryTokens, { browserIntent, readIntent, writeIntent, previous }),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_TOOL_LIMIT
  const primaryLimit = normalizedLimit > 2 ? normalizedLimit - 2 : normalizedLimit
  const selected = ranked.slice(0, primaryLimit).map(({ tool }) => tool)
  includeReferencedTools(selected, availableTools, normalizedLimit)

  return {
    tools: selected,
    names: selected.map((tool) => tool.name),
  }
}

export function compactToolCatalog(tools: Tool[], limit = 30): string {
  return tools
    .filter((tool) => !tool.name.startsWith('browser_'))
    .slice(0, limit)
    .map((tool) => tool.name)
    .join(', ')
}

function scoreTool(
  tool: Tool,
  queryTokens: Set<string>,
  intent: {
    browserIntent: boolean
    readIntent: boolean
    writeIntent: boolean
    previous: Set<string>
  },
): number {
  const nameTokens = tokenize(tool.name)
  const descriptionTokens = tokenize(tool.description)
  const parameterTokens = tokenize(JSON.stringify(tool.toolSpec.inputSchema ?? {}))
  const isBrowserTool = tool.name.startsWith('browser_')
  const isReadTool = /read-only|\b(?:get|list|search|find|read|status|view)\b/i.test(
    `${splitWords(tool.name)} ${tool.description}`,
  )
  const isWriteTool = /changes customer data|\b(?:create|add|update|delete|remove|approve|set)\b/i.test(
    `${splitWords(tool.name)} ${tool.description}`,
  )

  if (isBrowserTool && !intent.browserIntent) return intent.previous.has(tool.name) ? 1 : 0
  if (!isBrowserTool && intent.browserIntent) return 0
  if (intent.readIntent && !intent.writeIntent && isWriteTool) return 0

  let score = 0
  for (const queryToken of queryTokens) {
    score += bestTokenScore(queryToken, nameTokens) * 5
    score += bestTokenScore(queryToken, descriptionTokens) * 2
    score += bestTokenScore(queryToken, parameterTokens)
  }

  if (intent.readIntent && isReadTool) score += 5
  if (intent.writeIntent && isWriteTool) score += 5
  if (intent.writeIntent && isReadTool) score += 1
  if (intent.browserIntent && isBrowserTool) score += 4
  if (intent.previous.has(tool.name)) score += 3

  return score
}

function includeReferencedTools(selected: Tool[], available: Tool[], limit: number): void {
  if (selected.length >= limit) return
  const selectedNames = new Set(selected.map((tool) => tool.name))
  const descriptions = selected.map((tool) => normalize(splitWords(tool.description))).join(' ')

  for (const candidate of available) {
    if (selected.length >= limit || selectedNames.has(candidate.name)) continue
    const normalizedName = normalize(splitWords(candidate.name))
    if (!normalizedName || !descriptions.includes(normalizedName)) continue
    selected.push(candidate)
    selectedNames.add(candidate.name)
  }
}

function bestTokenScore(queryToken: string, candidates: Set<string>): number {
  if (candidates.has(queryToken)) return 1
  if (queryToken.length < 4) return 0

  for (const candidate of candidates) {
    if (candidate.length < 4) continue
    if (candidate.startsWith(queryToken) || queryToken.startsWith(candidate)) return 0.75
    if (Math.abs(candidate.length - queryToken.length) <= 1 && editDistanceAtMostOne(queryToken, candidate)) {
      return 0.65
    }
  }
  return 0
}

function tokenize(value: string): Set<string> {
  return new Set(
    splitWords(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(stem)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  )
}

function splitWords(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
}

function stem(value: string): string {
  if (value.length > 5 && value.endsWith('ies')) return `${value.slice(0, -3)}y`
  if (value.length > 5 && value.endsWith('ing')) return value.slice(0, -3)
  if (value.length > 4 && value.endsWith('ed')) return value.slice(0, -2)
  if (value.length > 3 && value.endsWith('s')) return value.slice(0, -1)
  return value
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true
  }
  return false
}

function normalize(value: string): string {
  return [...tokenize(value)].join(' ')
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false

  let leftIndex = 0
  let rightIndex = 0
  let edits = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) leftIndex += 1
    else if (right.length > left.length) rightIndex += 1
    else {
      leftIndex += 1
      rightIndex += 1
    }
  }
  return true
}
