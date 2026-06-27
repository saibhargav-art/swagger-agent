import type {
  InvocationContext,
  MCPToolWithExecute,
  SwaggerToolsOptions,
  SwaggerToolsResult,
  WebMCPToolDefinition,
} from './types';
import { parseSpec } from './parser';
import { transformSpec } from './transformer';

const registeredTools = new Map<string, WebMCPToolDefinition>();

export async function registerSwaggerTools(options: SwaggerToolsOptions): Promise<SwaggerToolsResult> {
  const spec = await parseSpec(options.spec, { baseUrl: options.baseUrl });
  const result = transformSpec(spec, {
    auth: options.auth,
    include: options.include,
    exclude: options.exclude,
    baseUrl: options.baseUrl,
    secureMode: options.secureMode,
  });

  for (const tool of result.tools as MCPToolWithExecute[]) {
    registeredTools.set(tool.name, tool);
  }

  return {
    ...result,
    info: spec.info,
  };
}

export async function executeSwaggerTool(
  name: string,
  params: Record<string, unknown>,
  invocationContext?: InvocationContext
): Promise<unknown> {
  const tool = registeredTools.get(name);

  if (!tool) {
    throw new Error(`Tool '${name}' is not registered.`);
  }

  if (typeof tool.execute !== 'function') {
    throw new Error(`Tool '${name}' has no execute function.`);
  }

  return tool.execute(params, invocationContext);
}

export function getRegisteredTools(): string[] {
  return [...registeredTools.keys()];
}

export function clearRegisteredTools() {
  registeredTools.clear();
}
