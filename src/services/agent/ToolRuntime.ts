import type { Tool } from '@/types/tool';
import type { ToolForm, ToolOption } from '@/types/chat';
import { humanizeToolName, normalizeText, titleCaseWords, words } from './AgentText';

export function toolSummary(tool: Tool): string {
  return tool.description.split('\n')[0]?.trim() || humanizeToolName(tool.name);
}

export function toolFields(tool: Tool): ToolForm['fields'] {
  return tool.schema.parameters.map((param) => ({
    name: param.name,
    type: param.type,
    description: param.description,
    required: param.required,
    enum: param.enum,
  }));
}

export function toolForm(
  tool: Tool,
  initialParams: Record<string, unknown> = {},
  mode: ToolForm['mode'] = 'input',
  confirmationDetails?: Record<string, unknown>
): ToolForm {
  return {
    toolName: tool.name,
    title: humanizeToolName(tool.name),
    description: toolSummary(tool),
    mode,
    fields: toolFields(tool),
    initialParams,
    confirmationDetails,
  };
}

export function toolFormWithIdChoices(
  tool: Tool,
  initialParams: Record<string, unknown>,
  choices: Array<{ label: string; value: string }>,
  mode: ToolForm['mode'] = 'input',
  confirmationDetails?: Record<string, unknown>
): ToolForm {
  return {
    ...toolForm(tool, initialParams, mode, confirmationDetails),
    fields: toolFields(tool).map((field) => (field.name === 'id' ? { ...field, options: choices } : field)),
  };
}

export function toolOptions(tools: Tool[], message = '', extractParams?: (message: string, tool: Tool) => Record<string, unknown>): ToolOption[] {
  return tools.slice(0, 8).map((tool) => ({
    toolName: tool.name,
    title: humanizeToolName(tool.name),
    description: toolSummary(tool),
    fields: toolFields(tool),
    initialParams: message && extractParams ? extractParams(message, tool) : {},
  }));
}

export function requiredFields(tool: Tool): string[] {
  return tool.schema.parameters.filter((param) => param.required).map((param) => param.name);
}

export function getTool(tools: Tool[], name: string): Tool | undefined {
  const normalizedName = normalizeText(name);
  return tools.find((tool) => {
    const candidates = [tool.name, humanizeToolName(tool.name), tool.id].map(normalizeText);
    return tool.name === name || candidates.includes(normalizedName);
  });
}

export function missingRequiredFields(tool: Tool, params: Record<string, unknown>): string[] {
  const isCreateTool = /\b(create|add|new)\b/i.test(`${tool.name} ${tool.description}`);
  const isWriteAction = isWriteTool(tool);
  return tool.schema.parameters
    .filter((param) => {
      if (param.required || param.name === 'id') return true;
      if (isWriteAction && param.enum?.length) return true;
      const paramText = `${param.name} ${param.description ?? ''}`;
      return isCreateTool && /\b(name|title|email|customer|account|user)\b/i.test(paramText);
    })
    .map((param) => param.name)
    .filter((field) => {
      const value = params[field];
      return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
    });
}

export function isWriteTool(tool: Tool): boolean {
  if (tool.metadata?.intent && ['get', 'read', 'list', 'search'].includes(tool.metadata.intent)) {
    return false;
  }

  if (tool.metadata?.requiresConfirmation !== undefined) return tool.metadata.requiresConfirmation;
  if (tool.metadata?.intent) {
    return ['create', 'update', 'delete', 'approve', 'write'].includes(tool.metadata.intent);
  }

  const text = `${tool.name} ${tool.description} ${tool.requiredScopes.join(' ')}`.toLowerCase();
  const hasWriteScope = tool.requiredScopes.some((scope) => /\b(write|delete|admin|mutate)\b/i.test(scope));
  const hasMutationVerb = /\b(create|update|delete|approve|write|refund|quota|mutate|set|remove)\b/.test(text);
  return hasWriteScope || hasMutationVerb;
}

export function userRequestedWrite(message: string): boolean {
  const messageWords = new Set(words(message));
  return [
    'create',
    'add',
    'make',
    'place',
    'submit',
    'book',
    'new',
    'update',
    'change',
    'set',
    'mark',
    'modify',
    'edit',
    'delete',
    'remove',
    'erase',
    'approve',
    'authorize',
    'accept',
  ].some((word) => messageWords.has(word));
}

export function askForMissingFields(tool: Tool, missing: string[]) {
  const details = missing.map((field) => {
    const param = tool.schema.parameters.find((item) => item.name === field);
    if (param?.enum?.length) {
      return `\`${field}\` (${param.enum.join(', ')})`;
    }

    if (/status|state/i.test(`${field} ${param?.description ?? ''}`)) {
      return `\`${field}\` (the connected app did not provide allowed values in webapi.json)`;
    }

    return `\`${field}\``;
  });

  return `I can ${humanizeToolName(tool.name).toLowerCase()}, but I need ${details.join(', ')} before I can proceed.`;
}

export function confirmationDetailsFor(
  params: Record<string, unknown>,
  resolution?: { lookup?: string; matchedRecord?: Record<string, unknown> }
) {
  if (!resolution?.lookup && !resolution?.matchedRecord) return params;

  return {
    ...(resolution.lookup ? { matched_record: titleCaseWords(resolution.lookup) } : {}),
    ...params,
  };
}
