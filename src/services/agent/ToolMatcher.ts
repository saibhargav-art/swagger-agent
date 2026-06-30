import type { Tool } from '@/types/tool';
import type { ToolOption } from '@/types/chat';
import { normalizeText, words, humanizeToolName } from './AgentText';
import { isWriteTool, toolFields, toolSummary } from './ToolRuntime';
import { lookupTextForMessage } from './ToolParams';

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
  const hasStatusCondition = [
    'status',
    'state',
    'approved',
    'pending',
    'processing',
    'fulfilled',
    'cancelled',
    'canceled',
    'complete',
    'completed',
  ].some((word) => messageWords.has(word));
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

function requiresRecordId(tool: Tool): boolean {
  return tool.schema.parameters.some((param) => param.required && /(^id$|uuid|identifier)/i.test(`${param.name} ${param.description ?? ''}`));
}

export function isCollectionReadTool(tool: Tool): boolean {
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

export function bestToolMatch(message: string, tools: Tool[]): Tool | null {
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

export function ambiguousToolOptions(
  message: string,
  tools: Tool[],
  extractParams: (message: string, tool: Tool) => Record<string, unknown>
): ToolOption[] {
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
    initialParams: extractParams(message, tool),
  }));
}
