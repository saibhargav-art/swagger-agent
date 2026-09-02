import type { WebMcpResponse, WebMcpTool } from '../shared/webmcp'

export async function discoverTools(tabId: number): Promise<WebMcpTool[]> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await browser.runtime.sendMessage({ type: 'webmcp:list', tabId }) as WebMcpResponse<WebMcpTool[]>
    if (!response.ok) throw new Error(response.error)
    if (response.value.length > 0 || attempt === 7) return response.value
    await delay(200)
  }
  return []
}

export async function executeTool(
  tabId: number,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const response = await browser.runtime.sendMessage({
    type: 'webmcp:execute', tabId, toolName, input,
  }) as WebMcpResponse
  if (!response.ok) throw new Error(response.error)
  return decodeResult(response.value)
}

function decodeResult(value: unknown): unknown {
  let current = value
  for (let attempt = 0; attempt < 2 && typeof current === 'string'; attempt += 1) {
    const text = current.trim()
    if (!text || (!text.startsWith('{') && !text.startsWith('[') && text !== 'null')) break
    try { current = JSON.parse(text) } catch { break }
  }
  return current
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
