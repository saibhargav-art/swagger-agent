import type { WebMcpRequest, WebMcpResponse, WebMcpTool } from '../shared/webmcp'

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: WebMcpRequest) => {
    if (message.type === 'webmcp:list') return listTools(message.tabId)
    if (message.type === 'webmcp:execute') {
      return executeTool(message.tabId, message.toolName, message.input)
    }
  })

  if (import.meta.env.FIREFOX) {
    const firefox = browser as typeof browser & {
      sidebarAction: { open: () => Promise<void> }
    }
    browser.action.onClicked.addListener(() => {
      void firefox.sidebarAction.open()
    })
    return
  }

  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

async function listTools(tabId: number): Promise<WebMcpResponse<WebMcpTool[]>> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async () => {
        const context = (document as Document & {
          modelContext?: { getTools?: () => Promise<unknown[]> }
        }).modelContext
        if (!context?.getTools) throw new Error('This page does not expose the WebMCP API.')

        const tools = await context.getTools()
        return tools.map((value) => {
          const tool = value as Record<string, unknown>
          return {
            name: String(tool.name || ''),
            title: typeof tool.title === 'string' ? tool.title : undefined,
            description: typeof tool.description === 'string' ? tool.description : undefined,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          }
        })
      },
    })
    return { ok: true, value: (injection?.result || []) as WebMcpTool[] }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

async function executeTool(
  tabId: number,
  toolName: string,
  input: Record<string, unknown>,
): Promise<WebMcpResponse> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [toolName, JSON.stringify(input)],
      func: async (requestedName, serializedInput) => {
        type PageTool = { name: string }
        const context = (document as Document & {
          modelContext?: {
            getTools?: () => Promise<PageTool[]>
            executeTool?: (tool: PageTool, input: string) => Promise<unknown>
          }
        }).modelContext
        if (!context?.getTools || !context.executeTool) {
          throw new Error('This page does not expose executable WebMCP tools.')
        }

        const tools = await context.getTools()
        const selected = tools.find((tool) => tool.name === requestedName)
        if (!selected) throw new Error(`Tool "${requestedName}" is no longer available.`)
        return await context.executeTool(selected, serializedInput)
      },
    })
    return { ok: true, value: injection?.result ?? null }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
