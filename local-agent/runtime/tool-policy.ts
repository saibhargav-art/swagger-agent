import type { Tool } from '@strands-agents/sdk'

import type { ExecutionPlan } from './execution-mode.js'
import type { ToolSelection } from './tool-planner.js'

export function toolsForExecutionMode(availableTools: Tool[], plan: ExecutionPlan): Tool[] {
  if (availableTools.length === 0) return []

  if (plan.mode === 'unsupported') return []

  if (plan.mode === 'browser-navigation' || plan.mode === 'browser-read' || plan.mode === 'browser-write') {
    const browserTools = availableTools.filter((tool) => isBrowserToolName(tool.name))
    if (browserTools.length === 0) return availableTools

    const readOnlyTools = availableTools.filter((tool) => !isBrowserToolName(tool.name) && isReadOnlyTool(tool))
    return uniqueTools([...browserTools, ...readOnlyTools])
  }

  if (plan.mode === 'api-read') {
    const readOnlyTools = availableTools.filter((tool) => !isBrowserToolName(tool.name) && isReadOnlyTool(tool))
    return readOnlyTools.length > 0 ? readOnlyTools : availableTools
  }

  return availableTools
}

export function expandSelectionForExecutionMode(
  selection: ToolSelection,
  availableTools: Tool[],
  plan: ExecutionPlan,
): void {
  if (!plan.browserWorkflow || !selection.names.some(isBrowserToolName)) return

  const selected = new Set(selection.names)
  const browserTools = availableTools.filter((tool) => isBrowserToolName(tool.name))

  for (const tool of browserTools) {
    if (selected.has(tool.name)) continue
    selection.tools.push(tool)
    selection.names.push(tool.name)
    selected.add(tool.name)
  }
}

export function isBrowserToolName(name: string): boolean {
  return /^browser_/i.test(name)
}

function isReadOnlyTool(tool: Tool): boolean {
  const text = `${tool.name} ${tool.description ?? ''}`
  return /\b(?:find|get|list|lookup|read|search|status|view|fetch|count|compare|read-only|readonly)\b/i.test(text)
    && !/\b(?:approve|cancel|change|create|delete|mutate|patch|post|put|remove|set|submit|update|write)\b/i.test(text)
}

function uniqueTools(tools: Tool[]): Tool[] {
  const seen = new Set<string>()
  const result: Tool[] = []

  for (const tool of tools) {
    if (seen.has(tool.name)) continue
    result.push(tool)
    seen.add(tool.name)
  }

  return result
}
