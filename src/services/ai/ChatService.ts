import { providerManager } from './ProviderManager';
import { webMCPService } from '@/services/webmcp/WebMCPService';
import { useChatStore } from '@/store/chatStore';
import { useProviderStore } from '@/store/providerStore';
import { useToolStore } from '@/store/toolStore';
import { useWebMCPStore } from '@/store/webMCPStore';
import { parseToolCall } from '@/utils/parseToolCall';
import { generateId } from '@/utils/format';
import type { Tool } from '@/types/tool';
import type { Conversation, ToolForm, ToolOption } from '@/types/chat';
import type { AIProvider, ChatMessage } from '@/providers/types';

// Instructs the AI how to call tools
function buildSystemPrompt(tools: Tool[]): string {
  if (tools.length === 0) {
    return `You are a helpful AI assistant.

No tools are available, so answer directly based on the user's request.`;
  }

  const toolDescriptions = tools
    .map((t) => {
      const params = t.schema.parameters
        .map(
          (p) =>
            `${p.name}${p.required ? '' : '?'} (${p.type})${p.description ? `: ${p.description}` : ''}`
        )
        .join(', ');

      return `- ${t.name}: ${t.description}${params ? `\n  parameters: ${params}` : ''}`;
    })
    .join('\n\n');

  return `You are a helpful AI assistant with access to the following tools:

${toolDescriptions}

Use a tool only when the user asks to perform an action that matches one of these tools.
Handle minor spelling mistakes in the user's message by using the closest matching tool and parameter names from the schema.
Extract every parameter that is clearly present in the user message, but leave uncertain or missing values out.

When you decide to execute a tool, return exactly one <tool_call> block with the chosen tool name and params only. Do not include prose before or after it. Example:
<tool_call>{"tool":"toolName","params":{"required_param":"value"}}</tool_call>

If the assistant returns plain JSON instead of XML tags, it must still be exactly one JSON object with keys \"tool\" and \"params\".

Do not describe the tool selection process, do not mention the app internals, and do not invent new tool names.
If the user's request does not map to an available tool, return exactly: NO_TOOL`;
}

function summarizeToolResult(toolName: string, result: unknown): string {
  const action = humanizeToolName(toolName);

  if (Array.isArray(result)) {
    if (result.length === 0) return 'No matching records found.';
    return `Found ${result.length} record${result.length === 1 ? '' : 's'}.`;
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const id = record.order_id ?? record.orderId ?? record.id ?? record.ID;

    if (typeof record.message === 'string') return record.message;
    if (id !== undefined) return `Success. ${action} completed: ${String(id)}`;
  }

  if (typeof result === 'string' && result.trim()) return result;
  return `Success. ${action} completed.`;
}

function applyPromptResultFilterForTool(result: unknown, sourceText: string, tool?: Tool): unknown {
  if (!Array.isArray(result) || !sourceText.trim()) return result;

  const records = result.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
  if (records.length === 0) return result;

  const metadataKeys = tool?.metadata?.filterable ?? [];
  const statusKeys = [
    ...new Set([
      ...metadataKeys,
      ...records.flatMap((record) => Object.keys(record).filter((key) => /status|state/i.test(key))),
    ]),
  ];
  if (statusKeys.length === 0) return result;

  const filtered = filterRecordsByPrompt(records, sourceText, statusKeys);
  if (filtered) return filtered;

  return result;
}

function filterRecordsByPrompt(
  records: Array<Record<string, unknown>>,
  sourceText: string,
  filterKeys: string[]
): Array<Record<string, unknown>> | null {
  const sourceWords = new Set(words(sourceText));
  const normalizedSource = normalizeText(sourceText);
  const ignored = new Set([
    'any',
    'check',
    'find',
    'get',
    'have',
    'if',
    'list',
    'look',
    'lookup',
    'order',
    'record',
    'search',
    'show',
    'state',
    'status',
    'with',
  ]);
  const candidateWords = [...sourceWords].filter((word) => !ignored.has(word));
  const hasFilterOperator = /\b(with|where|for|matching|named|called|name|customer|account|user|status|state)\b/i.test(
    sourceText
  );
  const matchesReturnedValue = records.some((record) =>
      filterKeys.some((key) => {
        const value = record[key];
        if (value === undefined || value === null) return false;
        return words(String(value).replace(/_/g, ' '))
          .filter((word) => !ignored.has(word))
          .some((word) => sourceWords.has(word));
      })
  );
  const hasExplicitFilterIntent = matchesReturnedValue || (hasFilterOperator && candidateWords.length > 0);

  if (!hasExplicitFilterIntent) return null;

  for (const key of filterKeys) {
    const values = [...new Set(records.map((record) => record[key]).filter((value) => value !== undefined && value !== null).map(String))];
    const matchedValue = values.find((value) => {
      const valueWords = words(value.replace(/_/g, ' ')).filter((word) => !ignored.has(word));
      const normalizedValue = normalizeText(value.replace(/_/g, ' '));
      return normalizedSource.includes(normalizedValue) || valueWords.some((word) => sourceWords.has(word));
    });

    if (matchedValue) {
      return records.filter((record) => String(record[key]) === matchedValue);
    }
  }

  return [];
}

function normalizeText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CANONICAL_TERMS = [
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
  'list',
  'show',
  'display',
  'fetch',
  'load',
  'search',
  'find',
  'lookup',
  'look',
  'get',
  'check',
  'see',
  'verify',
  'read',
  'status',
  'state',
  'order',
  'record',
  'item',
  'pending',
  'processing',
  'fulfilled',
  'cancelled',
  'canceled',
  'approved',
  'complete',
  'completed',
];

const WORD_ALIASES: Record<string, string> = {
  creat: 'create',
  crete: 'create',
  crate: 'create',
  oder: 'order',
  orde: 'order',
  ordar: 'order',
  ordor: 'order',
  stats: 'status',
  statu: 'status',
  statuz: 'status',
  stat: 'status',
  serch: 'search',
  searh: 'search',
  serach: 'search',
  delte: 'delete',
  delet: 'delete',
  remve: 'remove',
  updte: 'update',
  updat: 'update',
  fulfiled: 'fulfilled',
  fulfil: 'fulfilled',
  canceled: 'cancelled',
};

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  if (a === b) return true;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];

    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, prevDiagonal + cost);
      prevDiagonal = temp;
      rowMin = Math.min(rowMin, previous[j]);
    }

    if (rowMin > maxDistance) return false;
  }

  return previous[b.length] <= maxDistance;
}

function canonicalWord(word: string): string {
  const normalized = normalizeText(word);
  if (!normalized) return '';
  const singular = normalized.endsWith('s') && normalized.length > 3 ? normalized.slice(0, -1) : normalized;
  if (WORD_ALIASES[singular]) return WORD_ALIASES[singular];
  if (CANONICAL_TERMS.includes(singular)) return singular;

  const maxDistance = singular.length <= 4 ? 1 : 2;
  const matched = CANONICAL_TERMS.find((term) => editDistanceWithin(singular, term, maxDistance));
  return matched ?? singular;
}

function words(value: string): string[] {
  const ignored = new Set([
    'a',
    'an',
    'and',
    'are',
    'can',
    'could',
    'for',
    'how',
    'i',
    'if',
    'is',
    'it',
    'me',
    'my',
    'of',
    'please',
    'the',
    'to',
    'you',
    'that',
    'has',
    'have',
    'with',
  ]);

  return normalizeText(value)
    .split(/\s+/)
    .map(canonicalWord)
    .filter((word) => word.length > 2 && !ignored.has(word));
}

type UserAction = 'create' | 'update' | 'delete' | 'approve' | 'list' | 'search' | 'get' | 'read' | 'unknown';

interface UserIntent {
  action: UserAction;
  wantsCollection: boolean;
  hasCondition: boolean;
  hasLookupTarget: boolean;
  hasStatusCondition: boolean;
  words: Set<string>;
}

function analyzeUserIntent(message: string): UserIntent {
  const normalized = normalizeText(message);
  const messageWords = new Set(words(message));
  const hasLookupTarget =
    Boolean(lookupTextForMessage(message)) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(message);
  const hasStatusCondition = ['status', 'state', 'approved', 'pending', 'processing', 'fulfilled', 'cancelled', 'canceled', 'complete', 'completed']
    .some((word) => messageWords.has(word));
  const hasCondition =
    hasStatusCondition ||
    /\b(where|matching|with|having|worth|amount|greater|less|before|after|between)\b/i.test(normalized);

  const action = detectAction(messageWords, normalized);
  const isMutation = ['create', 'update', 'delete', 'approve'].includes(action);
  const wantsCollection =
    ['list', 'search'].includes(action) ||
    (!isMutation && /\b(any|all|every|latest|recent|records|items|orders|users|customers|matching)\b/i.test(normalized)) ||
    (!isMutation && hasCondition && !hasLookupTarget && action !== 'get');

  return {
    action,
    wantsCollection,
    hasCondition,
    hasLookupTarget,
    hasStatusCondition,
    words: messageWords,
  };
}

function detectAction(messageWords: Set<string>, normalized: string): UserAction {
  const has = (...items: string[]) => items.some((item) => messageWords.has(item));

  if (has('create', 'add', 'make', 'place', 'raise', 'submit', 'book', 'new')) return 'create';
  if (has('delete', 'remove', 'erase')) return 'delete';
  if (has('approve', 'authorize', 'accept')) return 'approve';
  if (has('update', 'change', 'set', 'mark', 'modify', 'edit')) return 'update';
  if (has('list', 'show', 'display', 'fetch', 'load')) return 'list';
  if (has('search', 'find', 'lookup', 'look')) return 'search';
  if (has('get', 'check', 'see', 'verify', 'read')) return 'read';
  if (/\b(status|state)\b/i.test(normalized)) return 'read';
  if (/\b(do we have|is there|are there|whether|exists?|available)\b/i.test(normalized)) return 'read';

  return 'unknown';
}

function toolIntent(tool: Tool): UserAction {
  const intent = tool.metadata?.intent;
  if (intent === 'create' || intent === 'update' || intent === 'delete' || intent === 'approve') return intent;
  if (intent === 'list' || intent === 'search' || intent === 'get') return intent;
  if (intent === 'read') return 'read';
  if (intent === 'write') return 'update';

  const text = normalizeText(`${tool.name} ${tool.description}`);
  if (/\b(create|add|new|make|place)\b/.test(text)) return 'create';
  if (/\b(delete|remove)\b/.test(text)) return 'delete';
  if (/\b(approve|authorize)\b/.test(text)) return 'approve';
  if (/\b(update|change|set|mark|modify|edit)\b/.test(text)) return 'update';
  if (/\b(list|all|latest)\b/.test(text)) return 'list';
  if (/\b(search|find|lookup)\b/.test(text)) return 'search';
  if (/\b(get|read|status|detail)\b/.test(text)) return 'get';
  return 'unknown';
}

function scoreIntent(tool: Tool, intent: UserIntent): number {
  const action = toolIntent(tool);
  let score = 0;

  if (intent.wantsCollection) {
    if (action === 'list') score += intent.hasLookupTarget && intent.action === 'search' ? 14 : 30;
    if (action === 'search') score += intent.hasLookupTarget ? 34 : 12;
    if (isCollectionReadTool(tool)) score += 10;
    if (intent.hasCondition && tool.metadata?.filterable?.length) score += 12;
    if (requiresRecordId(tool)) score -= intent.hasCondition && !intent.hasLookupTarget ? 32 : 14;
    if (isWriteTool(tool)) score -= 18;
  }

  if (!intent.wantsCollection && intent.action !== 'unknown') {
    if (action === intent.action) score += 28;
    if (intent.action === 'read' && ['get', 'search', 'list'].includes(action)) {
      if (intent.hasLookupTarget && intent.hasStatusCondition) {
        score += action === 'get' ? 26 : 4;
      } else {
        score += intent.hasLookupTarget ? 12 : 18;
      }
    }
    if (intent.action === 'get' && action === 'read') score += 10;
  }

  if (intent.hasStatusCondition) {
    if (tool.metadata?.filterable?.some((field) => /status|state/i.test(field))) score += 10;
    if (tool.schema.parameters.some((param) => /status|state/i.test(`${param.name} ${param.description ?? ''}`))) score += 4;
    if (intent.wantsCollection && requiresRecordId(tool)) score -= 12;
  }

  if (intent.hasLookupTarget) {
    if (action === 'search') score += 8;
    if (requiresRecordId(tool)) score += 4;
  }

  return score;
}

function toolText(tool: Tool): string {
  return [
    tool.name,
    tool.description,
    ...tool.schema.parameters.map((param) => `${param.name} ${param.description ?? ''}`),
  ].join(' ');
}

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function toolSummary(tool: Tool): string {
  return tool.description.split('\n')[0]?.trim() || humanizeToolName(tool.name);
}

function toolFields(tool: Tool): ToolForm['fields'] {
  return tool.schema.parameters.map((param) => ({
    name: param.name,
    type: param.type,
    description: param.description,
    required: param.required,
    enum: param.enum,
  }));
}

function toolForm(
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

function toolFormWithIdChoices(
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

function toolOptions(tools: Tool[], message = ''): ToolOption[] {
  return tools.slice(0, 8).map((tool) => ({
    toolName: tool.name,
    title: humanizeToolName(tool.name),
    description: toolSummary(tool),
    fields: toolFields(tool),
    initialParams: message ? extractParamsFromMessage(message, tool) : {},
  }));
}

function requiredFields(tool: Tool): string[] {
  return tool.schema.parameters.filter((param) => param.required).map((param) => param.name);
}

function getTool(tools: Tool[], name: string): Tool | undefined {
  const normalizedName = normalizeText(name);
  return tools.find((tool) => {
    const candidates = [tool.name, humanizeToolName(tool.name), tool.id].map(normalizeText);
    return tool.name === name || candidates.includes(normalizedName);
  });
}

function missingRequiredFields(tool: Tool, params: Record<string, unknown>): string[] {
  const isCreateTool = /\b(create|add|new)\b/i.test(`${tool.name} ${tool.description}`);
  const isWriteAction = isWriteTool(tool);
  return tool.schema.parameters.filter((param) => {
    if (param.required || param.name === 'id') return true;
    if (isWriteAction && param.enum?.length) return true;
    const paramText = `${param.name} ${param.description ?? ''}`;
    return isCreateTool && /\b(name|title|email|customer|account|user)\b/i.test(paramText);
  }).map((param) => param.name).filter((field) => {
    const value = params[field];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  });
}

function isWriteTool(tool: Tool): boolean {
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

function askForMissingFields(tool: Tool, missing: string[]) {
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

function confirmationDetailsFor(params: Record<string, unknown>, resolution?: IdResolution) {
  if (!resolution?.lookup && !resolution?.matchedRecord) return params;

  return {
    ...(resolution.lookup ? { matched_record: titleCaseWords(resolution.lookup) } : {}),
    ...params,
  };
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function cleanExtractedText(value: string): string {
  return value
    .replace(/\b(maybe|may be|probably|i think|it is|it's)\b/gi, ' ')
    .replace(/\b(an?|the|my|me|for)\b/gi, ' ')
    .replace(/\b(record|records|item|items|entry|entries|order|orders)\b/gi, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripKnownPromptWords(value: string): string {
  const removable = new Set([
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
    'list',
    'show',
    'display',
    'fetch',
    'load',
    'search',
    'find',
    'lookup',
    'look',
    'get',
    'check',
    'see',
    'verify',
    'read',
    'order',
    'record',
    'item',
    'status',
    'state',
    'for',
    'me',
    'my',
    'the',
    'a',
    'an',
    'with',
    'worth',
    'amount',
    'valued',
    'costing',
    'priced',
    'to',
    'as',
    'of',
  ]);

  return value
    .replace(/(?:[$]\s*)?\b\d+(?:\.\d+)?\b/g, ' ')
    .split(/\s+/)
    .filter((token) => {
      const canonical = canonicalWord(token);
      return token.trim() && !removable.has(canonical);
    })
    .join(' ')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

function inferNameLikeValue(message: string): string {
  const direct = extractLookupText(message);
  if (direct) return direct;

  const patterns = [
    /\b(?:for|named|called)\s+(.+?)(?=\s+(?:worth|amount|valued|costing|priced|status|state|to|as|with)\b|\s+[$]?\d|$)/i,
    /\b(?:customer|account|user|name)\s+(.+?)(?=\s+(?:worth|amount|valued|costing|priced|status|state|to|as|with)\b|\s+[$]?\d|$)/i,
  ];
  const fromPattern = patterns.map((pattern) => message.match(pattern)?.[1]).find(Boolean);
  const stripped = stripKnownPromptWords(fromPattern ?? message);
  return cleanExtractedText(stripped);
}

function extractLookupText(message: string): string {
  const targetPatterns = [
    /\b(?:create|add|make|place|submit|book)\s+(?:me\s+)?(?:an?\s+)?(?:new\s+)?(?:record|item|order)?\s*(?:for\s+)?(.+?)(?=\s+(?:with|where|that|which|status|state|to|as|worth|amount|valued|costing|priced)\b|\s+[$]?\d|$)/i,
    /\b(?:search|find|lookup|look\s+for)\s+(.+?)(?:\s+(?:record|item|order))?(?=\s+(?:with|where|that|which|status|state)\b|$)/i,
    /\b(?:status|state)\s+(?:for|of)\s+(.+?)(?=\s+(?:to|as|with|worth|amount|valued|costing|priced)\b|$)/i,
    /\b(?:what(?:'s| is)|show|get)\s+(.+?)\s+(?:status|state)\b/i,
    /\b(?:update|change|set|mark|modify|edit)\s+(.+?)\s+(?:status|state|as|to)\b/i,
    /\b(?:delete|remove|erase)\s+(.+?)(?:\s+(?:record|item|order))?(?=\s+(?:with|where|that|which)\b|$)/i,
    /\b(?:approve|authorize|accept)\s+(?:refund\s+)?(?:for\s+)?(.+?)(?:\s+(?:record|item|order))?(?=\s+(?:with|where|that|which)\b|$)/i,
  ];
  const targeted = targetPatterns.map((pattern) => message.match(pattern)?.[1]).find(Boolean);
  const direct = message.match(
    /\b(?:for|named|called|(?:with\s+)?(?:name|customer|account|user))\s+(.+?)(?=\s+(?:status|to|as|with|worth|amount|valued|costing|priced)\b|\s+[$]?\d|$)/i
  );
  const quoted = message.match(/["']([^"']+)["']/);
  const value = targeted ?? direct?.[1] ?? quoted?.[1] ?? '';
  const cleaned = cleanExtractedText(value);
  if (isStatusFilterReadRequest(message) && isGenericConditionTarget(cleaned)) return '';
  return cleaned;
}

function isGenericConditionTarget(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    /^(order|orders|record|records|item|items|one|ones)( that (has|have))?$/.test(normalized) ||
    /\b(any|all|every|approved|pending|processing|fulfilled|cancelled|canceled|complete|completed|we have|if|with)\b/.test(normalized)
  );
}

function isLikelyStandaloneLookup(message: string): boolean {
  const normalized = normalizeText(message);
  if (!normalized) return false;
  if (/\b(create|update|delete|remove|approve|search|find|list|get|status|statu|order|record|item)\b/i.test(normalized)) {
    return false;
  }
  return normalized.split(/\s+/).length <= 5;
}

function lookupTextForMessage(message: string): string {
  return extractLookupText(message) || (isLikelyStandaloneLookup(message) ? cleanExtractedText(message) : '');
}

function extractParamsFromMessage(message: string, tool: Tool): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const lowerMessage = message.toLowerCase();
  const messageWords = new Set(words(message));
  const numberMatches = [...message.matchAll(/(?:[$]\s*)?\b\d+(?:\.\d+)?\b/g)].map((match) =>
    Number(match[0].replace(/[$\s]/g, ''))
  );

  for (const field of tool.schema.parameters) {
    const fieldText = `${field.name} ${field.description ?? ''}`.toLowerCase();

    if (field.enum?.length) {
      const enumValue = field.enum.find((value) => {
        const normalizedValue = normalizeText(value);
        if (lowerMessage.includes(normalizedValue)) return true;
        const valueWords = words(value.replace(/_/g, ' '));
        return valueWords.some((word) => messageWords.has(word));
      });
      if (enumValue) params[field.name] = enumValue;
      continue;
    }

    if (field.type === 'number') {
      if (numberMatches.length > 0) {
        params[field.name] = numberMatches[numberMatches.length - 1];
      }
      continue;
    }

    if (/\bid\b|uuid|identifier/.test(fieldText)) {
      const uuid = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      if (uuid) params[field.name] = uuid[0];
      continue;
    }

    if (/customer|account|name/.test(fieldText)) {
      const cleaned = inferNameLikeValue(message);
      if (cleaned) params[field.name] = titleCaseWords(cleaned);
      continue;
    }

    if (/query|search/.test(fieldText)) {
      if (isStatusFilterReadRequest(message)) continue;
      const query = message.match(/\b(?:for|search|find)\s+(.+)$/i);
      const cleaned = cleanExtractedText(query?.[1] ?? stripKnownPromptWords(message));
      if (cleaned) params[field.name] = cleaned;
    }
  }

  return params;
}

function mergeParams(
  tool: Tool,
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(tool.schema.parameters.map((param) => param.name));
  return Object.fromEntries(
    Object.entries({ ...existing, ...next }).filter(([key, value]) => {
      if (!allowed.has(key)) return false;
      return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
    })
  );
}

function recordId(record: Record<string, unknown>, tool?: Tool): string | undefined {
  const metadataField = tool?.metadata?.recordIdField;
  const value = metadataField
    ? record[metadataField]
    : record.id ?? record.order_id ?? record.orderId ?? record.ID;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function recordPrimaryText(record: Record<string, unknown>, tool?: Tool): string {
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

function flattenRecords(value: unknown, tool?: Tool): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRecords(item, tool));
  }
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const nested = ['data', 'records', 'items', 'results', 'rows']
    .flatMap((key) => flattenRecords(record[key], tool));

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
      const isListTool = /\blist\b/i.test(`${tool.name} ${tool.description}`);
      const hasNoRequiredParams = tool.schema.parameters.every((param) => !param.required);
      return {
        tool,
        score:
          shared +
          (allowEmptyLookup && isListTool ? 6 : 0) +
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

function canLookupWithoutInput(tool: Tool): boolean {
  return tool.schema.parameters.every((param) => !param.required);
}

interface IdResolution {
  params: Record<string, unknown>;
  choices?: Array<{ label: string; value: string }>;
  matchedRecord?: Record<string, unknown>;
  lookup?: string;
  attemptedLookup?: boolean;
}

async function resolveRequiredId(
  conversation: { messages: Array<{ toolCall?: { result?: unknown } }> },
  tools: Tool[],
  tool: Tool,
  params: Record<string, unknown>,
  userContent: string
): Promise<IdResolution> {
  const needsId = tool.schema.parameters.some((param) => param.name === 'id');
  if (!needsId || params.id) return { params };

  const lookup = lookupTextForMessage(userContent);
  if (lookup) {
    const historyRecord = findRecordInMessages(conversation, lookup);
    const historyId = historyRecord ? recordId(historyRecord) : undefined;
    if (historyId) return { params: { ...params, id: historyId }, matchedRecord: historyRecord, lookup, attemptedLookup: true };
  }

  const searchTool = findLookupTool(tools, tool, !lookup);
  if (!searchTool || (!lookup && !canLookupWithoutInput(searchTool))) {
    return { params, lookup, attemptedLookup: Boolean(lookup) };
  }

  try {
    if (!lookup && searchTool.schema.parameters.some((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`))) {
      const fallback = findListLookupTool(tools, tool);
      if (!fallback) return { params };
      const { choices, records } = await resolveRecordChoices(fallback, '', tool, tools);
      if (choices.length === 1) {
        return { params: { ...params, id: choices[0].value }, matchedRecord: records[0] };
      }
      if (choices.length > 1) {
        return { params, choices };
      }
      return { params };
    }

    const { choices, records } = await resolveRecordChoices(searchTool, lookup, tool, tools);
    const normalizedLookup = lookup ? normalizeText(lookup) : '';
    const exact = lookup
      ? records.find((record) => normalizeText(recordPrimaryText(record, searchTool)) === normalizedLookup)
      : undefined;

    if (exact && recordId(exact, searchTool)) {
      return { params: { ...params, id: recordId(exact, searchTool) }, matchedRecord: exact, lookup, attemptedLookup: true };
    }

    if (choices.length === 1) {
      return { params: { ...params, id: choices[0].value }, matchedRecord: records[0], lookup, attemptedLookup: Boolean(lookup) };
    }

    if (choices.length > 1) {
      return { params, choices, lookup, attemptedLookup: Boolean(lookup) };
    }

    return { params, lookup, attemptedLookup: Boolean(lookup) };
  } catch {
    return { params, lookup, attemptedLookup: Boolean(lookup) };
  }
}

function unresolvedLookupMessage(resolution: IdResolution, tool: Tool) {
  if (resolution.choices?.length) return null;
  if (!resolution.attemptedLookup || !resolution.lookup) return null;
  return `I searched for "${resolution.lookup}" but could not find a matching record for ${humanizeToolName(
    tool.name
  ).toLowerCase()}. Enter a more exact name or search text, and I will keep this action open.`;
}

function askForRecordTarget(tool: Tool) {
  return `Which record should I use for ${humanizeToolName(
    tool.name
  ).toLowerCase()}? Enter a name or search text from the connected app, and I will look it up.`;
}

function isCancelMessage(message: string): boolean {
  return /^(cancel|stop|never mind|nevermind|clear)$/i.test(message.trim());
}

function rankedTools(message: string, tools: Tool[]): Array<{ tool: Tool; score: number }> {
  const normalizedMessage = normalizeText(message);
  const intent = analyzeUserIntent(message);
  const messageWords = intent.words;
  if (messageWords.size === 0) return [];

  return tools
    .map((tool) => {
      const normalizedToolName = normalizeText(tool.name);
      const humanizedName = normalizeText(humanizeToolName(tool.name));
      const summary = normalizeText(toolSummary(tool));
      const toolWords = words(toolText(tool));
      const sharedWords = toolWords.filter((word) => messageWords.has(word));
      const uniqueSharedWords = new Set(sharedWords);
      let score = scoreIntent(tool, intent) + uniqueSharedWords.size;

      if (normalizedMessage.includes(normalizedToolName) || normalizedMessage.includes(humanizedName)) {
        score += 8;
      }

      const [firstToolWord, secondToolWord] = words(tool.name);
      if (firstToolWord && messageWords.has(firstToolWord)) score += 4;
      if (secondToolWord && messageWords.has(secondToolWord)) score += 2;
      if (summary && summary.split(' ').some((word) => messageWords.has(word))) score += 1;
      if (messageWords.has('update') && toolWords.includes('update')) score += 4;
      if (messageWords.has('delete') && toolWords.includes('delete')) score += 4;
      if (messageWords.has('create') && toolWords.includes('create')) score += 4;
      if (intent.hasStatusCondition && toolWords.includes('statu')) score += 2;
      if (intent.wantsCollection && tool.schema.parameters.length === 0) score += 4;
      if (intent.wantsCollection && hasSearchQueryParam(tool) && !intent.hasLookupTarget) score -= 3;

      return { tool, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function isStatusFilterReadRequest(message: string): boolean {
  const messageWords = new Set(words(message));
  const hasReadIntent = ['check', 'get', 'list', 'show', 'find', 'search', 'see', 'verify'].some((word) =>
    messageWords.has(word)
  );
  const hasMutationIntent = ['create', 'update', 'delete', 'remove', 'approve', 'set', 'change'].some((word) => messageWords.has(word));
  const hasStatusIntent = ['status', 'state', 'approved', 'pending', 'processing', 'fulfilled', 'cancelled', 'canceled', 'complete', 'completed']
    .some((word) => messageWords.has(word));
  return hasReadIntent && hasStatusIntent && !hasMutationIntent;
}

function requiresRecordId(tool: Tool): boolean {
  return tool.schema.parameters.some((param) => param.required && /(^id$|uuid|identifier)/i.test(`${param.name} ${param.description ?? ''}`));
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

function hasSearchQueryParam(tool: Tool): boolean {
  return tool.schema.parameters.some((param) => /query|search|name|text|term/i.test(`${param.name} ${param.description ?? ''}`));
}

function bestToolMatch(message: string, tools: Tool[]): Tool | null {
  const ranked = rankedTools(message, tools);
  if (ranked.length === 0) return null;

  const [best, second] = ranked;
  if (!second || best.score >= second.score + 2 || best.score >= 8) {
    return best.tool;
  }

  return null;
}

function isVagueActionRequest(message: string): boolean {
  const messageWords = new Set(words(message));
  const actionWords = ['create', 'update', 'delete', 'remove', 'approve', 'get', 'search', 'list'];
  const hasAction = actionWords.some((word) => messageWords.has(word));
  if (!hasAction) return false;

  const nonActionWords = [...messageWords].filter((word) => !actionWords.includes(word));
  return nonActionWords.length === 0;
}

function likelyToolMatch(message: string, tools: Tool[]): Tool | null {
  return bestToolMatch(message, tools) ?? rankedTools(message, tools)[0]?.tool ?? null;
}

function likelyToolOptions(message: string, tools: Tool[]): ToolOption[] {
  return rankedTools(message, tools)
    .slice(0, 4)
    .map(({ tool }) => ({
      toolName: tool.name,
      title: humanizeToolName(tool.name),
      description: toolSummary(tool),
      fields: toolFields(tool),
      initialParams: extractParamsFromMessage(message, tool),
    }));
}

function ambiguousToolOptions(message: string, tools: Tool[]): ToolOption[] {
  const ranked = rankedTools(message, tools);
  if (ranked.length < 2) return [];

  const [best, ...rest] = ranked;
  if (isStatusFilterReadRequest(message) && isCollectionReadTool(best.tool)) {
    return [];
  }
  const similar = rest.filter((item) => best.score - item.score <= (isVagueActionRequest(message) ? 8 : 2));
  if (similar.length === 0) return [];

  return [best, ...similar].slice(0, 4).map(({ tool }) => ({
    toolName: tool.name,
    title: humanizeToolName(tool.name),
    description: toolSummary(tool),
    fields: toolFields(tool),
    initialParams: extractParamsFromMessage(message, tool),
  }));
}

function hasAnyToolMatch(message: string, tools: Tool[]): boolean {
  return rankedTools(message, tools).length > 0;
}

function isGreeting(message: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening|whats up|what's up)[!. ]*$/i.test(
    message.trim()
  );
}

function isCapabilityQuestion(message: string): boolean {
  return /\b(what can you do|can you do|help|available tools|list tools|what tools|capabilities)\b/i.test(message);
}

function describeTools(tools: Tool[]): string {
  if (tools.length === 0) return 'No actions are available from the connected app yet.';

  const lines = tools
    .slice(0, 8)
    .map((tool) => {
      const required = requiredFields(tool);
      return `- ${humanizeToolName(tool.name)}: ${toolSummary(tool)}${
        required.length ? ` Required: ${required.join(', ')}` : ''
      }`;
    })
    .join('\n');

  return `I can help with these connected app actions:\n${lines}`;
}

function exampleRequests(tools: Tool[]): string {
  const examples = tools.slice(0, 4).map((tool) => {
    const required = requiredFields(tool);
    if (required.length === 0) return `- ${humanizeToolName(tool.name)}`;
    return `- ${humanizeToolName(tool.name)} with ${required.map((field) => `<${field}>`).join(', ')}`;
  });

  return examples.length ? `\n\nTry one of these:\n${examples.join('\n')}` : '';
}

function handleLocalToolOnlyMessage(
  message: string,
  tools: Tool[]
): { content: string; toolOptions?: ToolOption[] } | null {
  if (isGreeting(message)) {
    return {
      content: `Hi. I can help with the app you connected here.\n\n${describeTools(tools)}${exampleRequests(tools)}`,
      toolOptions: toolOptions(tools, message),
    };
  }

  if (isCapabilityQuestion(message)) {
    return {
      content: `${describeTools(tools)}${exampleRequests(tools)}`,
      toolOptions: toolOptions(tools, message),
    };
  }

  if (!hasAnyToolMatch(message, tools)) {
    return {
      content: `Sorry, I couldn't proceed with that request. I can only help with actions from the connected app.\n\n${describeTools(
        tools
      )}${exampleRequests(tools)}`,
      toolOptions: toolOptions(tools, message),
    };
  }

  return null;
}

export class ChatService {
  private async planWithModel(provider: AIProvider, tools: Tool[], conversation: Conversation, userContent: string) {
    const history: ChatMessage[] = conversation.messages
      .filter((m) => !m.isStreaming)
      .slice(-8)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await provider.chat([
      {
        role: 'system',
        content: buildSystemPrompt(tools),
      },
      ...history,
      { role: 'user', content: userContent },
    ]);

    return parseToolCall(response);
  }

  private async handleToolPlan({
    conversationId,
    messageId,
    conversation,
    tools,
    plan,
    userContent,
  }: {
    conversationId: string;
    messageId: string;
    conversation: Conversation;
    tools: Tool[];
    plan: { tool: string; params: Record<string, unknown> };
    userContent: string;
  }): Promise<boolean> {
    const { updateMessage, setPendingToolRequest } = useChatStore.getState();
    const toolDefinition = getTool(tools, plan.tool);
    if (!toolDefinition) return false;

    const resolution = await resolveRequiredId(
      conversation,
      tools,
      toolDefinition,
      mergeParams(toolDefinition, {}, { ...extractParamsFromMessage(userContent, toolDefinition), ...plan.params }),
      userContent
    );
    const params = resolution.params;
    const missing = missingRequiredFields(toolDefinition, params);

    if (missing.length > 0) {
      const lookupMessage = missing.includes('id') ? unresolvedLookupMessage(resolution, toolDefinition) : null;
      setPendingToolRequest(conversationId, {
        toolName: toolDefinition.name,
        params,
      });

      if (lookupMessage) {
        updateMessage(conversationId, messageId, {
          content: lookupMessage,
          isStreaming: false,
        });
        return true;
      }

      if (missing.includes('id') && !resolution.choices?.length) {
        updateMessage(conversationId, messageId, {
          content: askForRecordTarget(toolDefinition),
          isStreaming: false,
        });
        return true;
      }

      const mode: ToolForm['mode'] = isWriteTool(toolDefinition) ? 'confirm' : 'input';
      updateMessage(conversationId, messageId, {
        content: resolution.choices?.length
          ? `I found matching records. Select the record, then ${
              mode === 'confirm' ? 'confirm' : 'execute'
            } ${humanizeToolName(toolDefinition.name).toLowerCase()}.`
          : `${askForMissingFields(toolDefinition, missing)}\n\nComplete the empty fields below.`,
        toolForm: resolution.choices?.length
          ? toolFormWithIdChoices(
              toolDefinition,
              params,
              resolution.choices,
              mode,
              confirmationDetailsFor(params, resolution)
            )
          : toolForm(toolDefinition, params, mode, confirmationDetailsFor(params, resolution)),
        isStreaming: false,
      });
      return true;
    }

    setPendingToolRequest(conversationId, null);

    if (isWriteTool(toolDefinition)) {
      updateMessage(conversationId, messageId, {
        content: `Confirm ${humanizeToolName(toolDefinition.name).toLowerCase()} with these details.`,
        toolForm: toolForm(toolDefinition, params, 'confirm', confirmationDetailsFor(params, resolution)),
        isStreaming: false,
      });
      return true;
    }

    await this.executeToolCall(conversationId, messageId, toolDefinition, params, userContent);
    return true;
  }

  private async executeToolCall(
    conversationId: string,
    messageId: string,
    tool: Tool,
    params: Record<string, unknown>,
    sourceText = ''
  ): Promise<void> {
    const { updateMessage } = useChatStore.getState();
    const startedAt = Date.now();

    updateMessage(conversationId, messageId, {
      content: '',
      toolCall: {
        toolName: tool.name,
        params,
        status: 'executing',
        startedAt,
      },
      isStreaming: false,
    });

    try {
      const rawResult = await webMCPService.executeTool(tool.name, params);
      const result = applyPromptResultFilterForTool(rawResult, sourceText, tool);

      updateMessage(conversationId, messageId, {
        content: summarizeToolResult(tool.name, result),
        toolCall: {
          toolName: tool.name,
          params,
          status: 'success',
          result,
          startedAt,
          completedAt: Date.now(),
        },
      });

    } catch (err) {
      let error = err instanceof Error ? err.message : 'Tool execution failed';
      if (typeof error === 'string' && error.includes('No WebMCP base URL configured')) {
        error = 'No WebMCP base URL configured. Connect your WebMCP URL in Connections to enable tool execution.';
      }

      updateMessage(conversationId, messageId, {
        content: '',
        toolCall: {
          toolName: tool.name,
          params,
          status: 'error',
          error,
          startedAt,
          completedAt: Date.now(),
        },
      });
    }
  }

  async send(conversationId: string, userContent: string): Promise<void> {
    const { conversations, addMessage, updateMessage, setStreaming } =
      useChatStore.getState();
    const { setPendingToolRequest } = useChatStore.getState();
    const { activeProviderId, configs } = useProviderStore.getState();
    const { tools } = useToolStore.getState();

    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversation) return;

    const assistantMsgId = generateId();

    addMessage(conversationId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    setStreaming(true);

    try {
      const provider = providerManager.getProvider(activeProviderId, configs);
      const { status: mcpStatus, baseUrl } = useWebMCPStore.getState();

      if (!provider.isConfigured()) {
        updateMessage(conversationId, assistantMsgId, {
          content:
            'Provider not configured. Go to **Connections** to add credentials and test the provider.',
          isStreaming: false,
        });
        return;
      }

      if (mcpStatus === 'connected' && tools.length === 0) {
        updateMessage(conversationId, assistantMsgId, {
          content:
            'WebMCP tools are still loading. Please wait a moment and try again.',
          isStreaming: false,
        });
        return;
      }

      const pendingTool = conversation.pendingToolRequest;

      if (pendingTool && isCancelMessage(userContent)) {
        setPendingToolRequest(conversationId, null);
        updateMessage(conversationId, assistantMsgId, {
          content: 'Cancelled the pending action.',
          isStreaming: false,
        });
        return;
      }

      const pendingToolDefinition = pendingTool ? getTool(tools, pendingTool.toolName) : undefined;
      if (pendingToolDefinition) {
        const handled = await this.handleToolPlan({
          conversationId,
          messageId: assistantMsgId,
          conversation,
          tools,
          plan: {
            tool: pendingToolDefinition.name,
            params: mergeParams(
              pendingToolDefinition,
              pendingTool?.params ?? {},
              extractParamsFromMessage(userContent, pendingToolDefinition)
            ),
          },
          userContent,
        });
        if (handled) return;
      }

      const localResponse = pendingTool ? null : handleLocalToolOnlyMessage(userContent, tools);
      if (localResponse) {
        updateMessage(conversationId, assistantMsgId, {
          content: localResponse.content,
          toolOptions: localResponse.toolOptions,
          isStreaming: false,
        });
        return;
      }

      if (mcpStatus === 'connected' && baseUrl.trim()) {
        updateMessage(conversationId, assistantMsgId, {
          content: 'Selecting an action...',
        });

        try {
          const modelPlan = await this.planWithModel(provider, tools, conversation, userContent);
          if (modelPlan) {
            const handled = await this.handleToolPlan({
              conversationId,
              messageId: assistantMsgId,
              conversation,
              tools,
              plan: modelPlan,
              userContent,
            });
            if (handled) return;
          }
        } catch {
          // Fall back to deterministic routing below when the provider cannot produce a valid plan.
        }
      }

      const ambiguousOptions = pendingTool ? [] : ambiguousToolOptions(userContent, tools);
      if (ambiguousOptions.length > 1) {
        updateMessage(conversationId, assistantMsgId, {
          content: 'I found multiple matching actions. Which one do you mean?',
          toolOptions: ambiguousOptions,
          isStreaming: false,
        });
        return;
      }

      const directMatch = bestToolMatch(userContent, tools);
      if (directMatch) {
        const handled = await this.handleToolPlan({
          conversationId,
          messageId: assistantMsgId,
          conversation,
          tools,
          plan: {
            tool: directMatch.name,
            params: extractParamsFromMessage(userContent, directMatch),
          },
          userContent,
        });
        if (handled) return;
      }

      const match = likelyToolMatch(userContent, tools);
      if (match) {
        const options = likelyToolOptions(userContent, tools);
        updateMessage(conversationId, assistantMsgId, {
          content: `Did you mean ${humanizeToolName(match.name)}? Select the action to continue.`,
          toolOptions: options.length > 0 ? options : toolOptions([match], userContent),
          isStreaming: false,
        });
        return;
      }

      updateMessage(conversationId, assistantMsgId, {
        content: `I could not map that request to one connected app action. I can perform these actions:\n\n${describeTools(
          tools
        )}${exampleRequests(tools)}`,
        toolOptions: toolOptions(tools, userContent),
        isStreaming: false,
      });
    } catch (err) {
      let error = err instanceof Error ? err.message : 'An error occurred';
      if (typeof error === 'string' && error.includes('No WebMCP base URL configured')) {
        error = 'No WebMCP base URL configured. Connect your WebMCP URL in Connections to enable tools.';
      }

      updateMessage(conversationId, assistantMsgId, {
        content: `Error: ${error}`,
        isStreaming: false,
      });
    } finally {
      setStreaming(false);
      updateMessage(conversationId, assistantMsgId, { isStreaming: false });
    }
  }
}

export const chatService = new ChatService();
