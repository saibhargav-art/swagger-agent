import type { Tool } from '@strands-agents/sdk'

import type { ToolSelection } from './tool-planner.js'

type ToolsOnlyPlan = {
  mode: 'tools'
  browserWorkflow: false
  pureBrowserNavigation: false
}

export function toolsForExecutionMode(availableTools: Tool[], _plan: ToolsOnlyPlan): Tool[] {
  if (availableTools.length === 0) return []
  return availableTools
}

export function expandSelectionForExecutionMode(
  selection: ToolSelection,
  availableTools: Tool[],
  plan: ToolsOnlyPlan,
): void {
  if (!plan.browserWorkflow) return

  const selected = new Set(selection.names)
  const browserTools = availableTools.filter((tool) => isBrowserToolName(tool.name))

  for (const tool of browserTools) {
    if (selected.has(tool.name)) continue
    selection.tools.push(tool)
    selection.names.push(tool.name)
    selected.add(tool.name)
  }

  orderBrowserWorkflowSelection(selection)
}

export function isBrowserToolName(name: string): boolean {
  return /^browser_/i.test(name)
}

function orderBrowserWorkflowSelection(selection: ToolSelection): void {
  const byName = new Map(selection.tools.map((tool) => [tool.name, tool]))
  const orderedNames = [...selection.names].sort((left, right) => browserWorkflowRank(left) - browserWorkflowRank(right))
  selection.names = [...new Set(orderedNames)]
  selection.tools = selection.names
    .map((name) => byName.get(name))
    .filter((tool): tool is Tool => Boolean(tool))
}

function browserWorkflowRank(name: string): number {
  if (name === 'browser_navigate' || name === 'browser_tabs') return 0
  if (name === 'browser_snapshot') return 1
  if (name === 'browser_wait_for') return 2
  if (name.startsWith('browser_')) return 3
  return 4
}
