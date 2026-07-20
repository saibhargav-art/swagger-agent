import { tool } from '@strands-agents/sdk'

import { retrieveToolCandidates } from '../local-agent/runtime/tool-planner.js'

const tools = [
  makeTool('createOrder', 'Create a customer order with a name and amount.'),
  makeTool('updateOrderStatus', 'Update the status of an existing order.'),
  makeTool('searchOrders', 'Search orders by customer name.'),
  makeTool('listOrders', 'Return all available orders.'),
  makeTool('deleteOrder', 'Delete an existing order.'),
  makeTool('browser_navigate', 'Navigate to a URL in the browser.'),
  makeTool('browser_snapshot', 'Inspect the current page or a target element.'),
]

assertCandidate('create an order', 'createOrder', 3)
assertCandidate('creat an ordr', 'createOrder', 3)
assertCandidate('search orders for Satya', 'searchOrders', 3)
assertCandidate('open this URL in the browser', 'browser_navigate', 3)
assertCandidate('Satya', 'deleteOrder', 3, ['deleteOrder'])

console.log('Tool planner candidate tests passed.')

function assertCandidate(message: string, expected: string, limit: number, previous: string[] = []): void {
  const names = retrieveToolCandidates(tools, message, previous, limit).map((candidate) => candidate.name)
  if (!names.includes(expected)) {
    throw new Error(`Expected ${expected} for "${message}", received: ${names.join(', ')}`)
  }
}

function makeTool(name: string, description: string) {
  return tool({
    name,
    description,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    callback: () => ({ ok: true }),
  })
}
