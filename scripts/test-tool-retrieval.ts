import { tool } from '@strands-agents/sdk'

import { selectToolsForMessage } from '../local-agent/runtime/tool-retrieval.js'

const tools = [
  makeTool('createOrder', 'Create an order. This changes customer data.'),
  makeTool('updateOrderStatus', 'Update order status. This changes customer data.'),
  makeTool('searchOrders', 'Search orders by customer name. This is a read-only tool.'),
  makeTool('listOrders', 'List all orders. This is a read-only tool.'),
  makeTool('deleteOrder', 'Delete an order. This changes customer data.'),
  makeTool('browser_navigate', 'Navigate to a URL in the browser.'),
  makeTool('browser_click', 'Click an element on the visible page.'),
]

assertIncludes('check if there are duplicate orders', 'listOrders')
assertExcludes('check if there are duplicate orders', 'deleteOrder')
assertIncludes('creat an ordr for Satya', 'createOrder')
assertIncludes('open the connected website orders page', 'browser_navigate')
assertExcludes('open the connected website orders page', 'createOrder')
assertIncludes('delete the order', 'deleteOrder')
assertIncludes('Satya', 'deleteOrder', ['deleteOrder', 'searchOrders'])

const greeting = selectToolsForMessage(tools, 'hello').names
if (greeting.length !== 0) throw new Error(`Expected no tools for greeting, received: ${greeting.join(', ')}`)

console.log('Tool retrieval tests passed.')

function assertIncludes(message: string, expected: string, previous: string[] = []): void {
  const names = selectToolsForMessage(tools, message, previous).names
  if (!names.includes(expected)) {
    throw new Error(`Expected ${expected} for "${message}", received: ${names.join(', ')}`)
  }
}

function assertExcludes(message: string, unexpected: string): void {
  const names = selectToolsForMessage(tools, message).names
  if (names.includes(unexpected)) {
    throw new Error(`Did not expect ${unexpected} for "${message}", received: ${names.join(', ')}`)
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
