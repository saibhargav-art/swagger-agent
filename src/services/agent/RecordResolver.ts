import type { Tool } from '@/types/tool';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { humanizeToolName, normalizeText, words } from './AgentText';
import { lookupTextForMessage } from './ToolParams';
import { getTool } from './ToolRuntime';

export interface IdResolution {
  params: Record<string, unknown>;
  choices?: Array<{ label: string; value: string }>;
  matchedRecord?: Record<string, unknown>;
  lookup?: string;
  attemptedLookup?: boolean;
}

export function recordId(record: Record<string, unknown>, tool?: Tool): string | undefined {
  const metadataField = tool?.metadata?.recordIdField;
  const value = metadataField
    ? record[metadataField]
    : record.id ?? record.order_id ?? record.orderId ?? record.ID;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function recordPrimaryText(record: Record<string, unknown>, tool?: Tool): string {
  const metadataField = tool?.metadata?.displayField;
  if (metadataField && typeof record[metadataField] === 'string' && String(record[metadataField]).trim()) {
    return String(record[metadataField]);
  }

  const preferredKeys = ['name', 'title', 'customer_name', 'customerName', 'customer', 'email', 'label'];
  const preferred = preferredKeys
    .map((key) => record[key])
    .find((value) => typeof value === 'string' && value.trim());

  if (typeof preferred === 'string') return preferred;

  const fallback = Object.values(record).find((value) => typeof value === 'string' && value.trim());
  return typeof fallback === 'string' ? fallback : '';
}

export function flattenRecords(value: unknown, tool?: Tool): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRecords(item, tool));
  }
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const nested = ['data', 'records', 'items', 'results', 'rows'].flatMap((key) =>
    flattenRecords(record[key], tool)
  );

  return recordId(record, tool) ? [record, ...nested] : nested;
}

function findRecordInMessages(conversation: { messages: Array<{ toolCall?: { result?: unknown } }> }, lookup: string) {
  const normalizedLookup = normalizeText(lookup);
  if (!normalizedLookup) return undefined;

  for (const message of [...conversation.messages].reverse()) {
    const records = flattenRecords(message.toolCall?.result);
    const exact = records.find((record) => normalizeText(recordPrimaryText(record)) === normalizedLookup);
    const fuzzy = exact ?? records.find((record) => normalizeText(recordPrimaryText(record)).includes(normalizedLookup));
    if (fuzzy && recordId(fuzzy)) return fuzzy;
  }

  return undefined;
}

function recordOption(record: Record<string, unknown>, tool?: Tool): { label: string; value: string } | null {
  const id = recordId(record, tool);
  if (!id) return null;

  const primary = recordPrimaryText(record, tool);

  return {
    value: id,
    label: primary || 'Record',
  };
}

function toolConceptWords(tool: Tool): Set<string> {
  const ignored = new Set(['create', 'update', 'delete', 'remove', 'approve', 'get', 'list', 'search', 'status']);
  return new Set(words(`${tool.name} ${tool.description}`).filter((word) => !ignored.has(word)));
}

function canLookupWithoutInput(tool: Tool): boolean {
  return tool.schema.parameters.every((param) => !param.required);
}

function isCollectionReadTool(tool: Tool): boolean {
  if (tool.metadata?.intent && ['list', 'search'].includes(tool.metadata.intent)) return true;

  const text = `${tool.name} ${tool.description} ${tool.requiredScopes.join(' ')}`;
  const hasReadScope = tool.requiredScopes.some((scope) => /read|view|list|search/i.test(scope));
  const hasCollectionVerb = /\b(list|search|find|query|browse)\b/i.test(text);
  const hasNoRequiredParams = tool.schema.parameters.every((param) => !param.required);
  return hasReadScope && hasCollectionVerb && hasNoRequiredParams;
}

function isListTool(tool: Tool): boolean {
  if (tool.metadata?.intent === 'list') return true;
  return /\blist\b/i.test(`${tool.name} ${tool.description}`);
}

function findLookupTool(tools: Tool[], targetTool: Tool, allowEmptyLookup = false): Tool | undefined {
  if (targetTool.metadata?.resolveIdWith) {
    const configured = getTool(tools, targetTool.metadata.resolveIdWith);
    if (configured) return configured;
  }

  const targetWords = toolConceptWords(targetTool);
  const candidates = tools
    .filter((tool) => tool.name !== targetTool.name)
    .filter((tool) => /\b(search|find|list|get|lookup)\b/i.test(`${tool.name} ${tool.description}`))
    .filter((tool) => !allowEmptyLookup || canLookupWithoutInput(tool))
    .map((tool) => {
      const candidateWords = toolConceptWords(tool);
      const shared = [...candidateWords].filter((word) => targetWords.has(word)).length;
      const hasQueryParam = tool.schema.parameters.some((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`));
      const hasNoParams = tool.schema.parameters.length === 0;
      const listTool = /\blist\b/i.test(`${tool.name} ${tool.description}`);
      const hasNoRequiredParams = tool.schema.parameters.every((param) => !param.required);
      return {
        tool,
        score:
          shared +
          (allowEmptyLookup && listTool ? 6 : 0) +
          (allowEmptyLookup && hasNoParams ? 4 : 0) +
          (!allowEmptyLookup && hasQueryParam ? 3 : 0) +
          (hasNoRequiredParams ? 1 : 0),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.tool ?? tools.find((tool) => {
    if (tool.name === targetTool.name) return false;
    if (!/\b(search|find|lookup)\b/i.test(`${tool.name} ${tool.description}`)) return false;
    if (allowEmptyLookup && !canLookupWithoutInput(tool)) return false;
    return tool.schema.parameters.some((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`));
  });
}

function findListLookupTool(tools: Tool[], targetTool: Tool): Tool | undefined {
  const targetWords = toolConceptWords(targetTool);
  return tools
    .filter((tool) => tool.name !== targetTool.name)
    .filter((tool) => isCollectionReadTool(tool))
    .filter((tool) => canLookupWithoutInput(tool))
    .map((tool) => ({
      tool,
      score:
        (isListTool(tool) ? 10 : 0) +
        [...toolConceptWords(tool)].filter((word) => targetWords.has(word)).length,
    }))
    .sort((a, b) => b.score - a.score)[0]?.tool;
}

function lookupParams(tool: Tool, lookup: string): Record<string, unknown> {
  const queryField = tool.schema.parameters.find((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`));
  return queryField ? { [queryField.name]: lookup } : {};
}

async function executeLookupTool(searchTool: Tool, lookup: string, targetTool: Tool, tools: Tool[]): Promise<unknown> {
  try {
    return await webMCPService.executeTool(searchTool.name, lookup ? lookupParams(searchTool, lookup) : {});
  } catch (err) {
    const fallback = findListLookupTool(tools, targetTool);
    if (!fallback || fallback.name === searchTool.name) throw err;
    return webMCPService.executeTool(fallback.name, {});
  }
}

async function resolveRecordChoices(
  searchTool: Tool,
  lookup: string,
  targetTool: Tool,
  tools: Tool[]
): Promise<{
  choices: Array<{ label: string; value: string }>;
  records: Array<Record<string, unknown>>;
}> {
  const result = await executeLookupTool(searchTool, lookup, targetTool, tools);
  const normalizedLookup = lookup ? normalizeText(lookup) : '';
  const allRecords = flattenRecords(result, searchTool).filter((record) => recordId(record, searchTool));
  const records = normalizedLookup
    ? allRecords.filter((record) => normalizeText(recordPrimaryText(record, searchTool)).includes(normalizedLookup))
    : allRecords;
  return {
    records,
    choices: records
      .map((record) => recordOption(record, searchTool))
      .filter((option): option is { label: string; value: string } => Boolean(option)),
  };
}

function isUuidLike(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

export async function resolveRequiredId(
  conversation: { messages: Array<{ toolCall?: { result?: unknown } }> },
  tools: Tool[],
  tool: Tool,
  params: Record<string, unknown>,
  userContent: string,
  lookupOverride = ''
): Promise<IdResolution> {
  const needsId = tool.schema.parameters.some((param) => param.name === 'id');
  if (!needsId) return { params };
  if (params.id && isUuidLike(params.id)) return { params };

  const modelProvidedLookup = params.id && !isUuidLike(params.id) ? String(params.id).trim() : '';
  const lookup = lookupOverride.trim() || modelProvidedLookup || lookupTextForMessage(userContent);
  const paramsWithoutUntrustedId = modelProvidedLookup ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'id')) : params;
  if (lookup) {
    const historyRecord = findRecordInMessages(conversation, lookup);
    const historyId = historyRecord ? recordId(historyRecord) : undefined;
    if (historyId) {
      return { params: { ...paramsWithoutUntrustedId, id: historyId }, matchedRecord: historyRecord, lookup, attemptedLookup: true };
    }
  }

  const searchTool = findLookupTool(tools, tool, !lookup);
  if (!searchTool || (!lookup && !canLookupWithoutInput(searchTool))) {
    return { params: paramsWithoutUntrustedId, lookup, attemptedLookup: Boolean(lookup) };
  }

  try {
    if (!lookup && searchTool.schema.parameters.some((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`))) {
      const fallback = findListLookupTool(tools, tool);
      if (!fallback) return { params: paramsWithoutUntrustedId };
      const { choices, records } = await resolveRecordChoices(fallback, '', tool, tools);
      if (choices.length === 1) {
        return { params: { ...paramsWithoutUntrustedId, id: choices[0].value }, matchedRecord: records[0] };
      }
      if (choices.length > 1) {
        return { params: paramsWithoutUntrustedId, choices };
      }
      return { params: paramsWithoutUntrustedId };
    }

    const { choices, records } = await resolveRecordChoices(searchTool, lookup, tool, tools);
    const normalizedLookup = lookup ? normalizeText(lookup) : '';
    const exact = lookup
      ? records.find((record) => normalizeText(recordPrimaryText(record, searchTool)) === normalizedLookup)
      : undefined;

    if (exact && recordId(exact, searchTool)) {
      return { params: { ...paramsWithoutUntrustedId, id: recordId(exact, searchTool) }, matchedRecord: exact, lookup, attemptedLookup: true };
    }

    if (choices.length === 1) {
      return { params: { ...paramsWithoutUntrustedId, id: choices[0].value }, matchedRecord: records[0], lookup, attemptedLookup: Boolean(lookup) };
    }

    if (choices.length > 1) {
      return { params: paramsWithoutUntrustedId, choices, lookup, attemptedLookup: Boolean(lookup) };
    }

    return { params: paramsWithoutUntrustedId, lookup, attemptedLookup: Boolean(lookup) };
  } catch {
    return { params: paramsWithoutUntrustedId, lookup, attemptedLookup: Boolean(lookup) };
  }
}

export function unresolvedLookupMessage(resolution: IdResolution, tool: Tool) {
  if (resolution.choices?.length) return null;
  if (!resolution.attemptedLookup || !resolution.lookup) return null;
  return `I searched for "${resolution.lookup}" but could not find a matching record for ${humanizeToolName(
    tool.name
  ).toLowerCase()}. Enter a more exact name or search text, and I will keep this action open.`;
}

export function askForRecordTarget(tool: Tool) {
  return `Which record should I use for ${humanizeToolName(
    tool.name
  ).toLowerCase()}? Enter a name or search text from the connected app, and I will look it up.`;
}
