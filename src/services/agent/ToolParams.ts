import type { Tool } from '@/types/tool';
import { normalizeText, titleCaseWords, words } from './AgentText';

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
    'customer',
    'account',
    'user',
    'name',
    'named',
    'called',
    'please',
    'can',
    'could',
    'you',
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
      const canonical = words(token)[0] ?? normalizeText(token);
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
    /\b(?:delete|remove|erase|approve|update|change|set|mark|modify|edit|get|check|see|verify)\s+(?:the\s+)?(?:record|item|order)?\s*(?:for|of|named|called|with\s+name)?\s+(.+?)(?=\s+(?:with|where|that|which|status|state|to|as|worth|amount|valued|costing|priced)\b|\s+[$]?\d|$)/i,
    /\b(?:for|of|named|called|name|customer|account|user)\s+(.+?)(?=\s+(?:with|where|that|which|status|state|to|as|worth|amount|valued|costing|priced)\b|\s+[$]?\d|$)/i,
  ];

  for (const pattern of targetPatterns) {
    const match = message.match(pattern)?.[1];
    const cleaned = match ? cleanExtractedText(stripKnownPromptWords(match)) : '';
    if (cleaned && !isGenericConditionTarget(cleaned)) return cleaned;
  }

  return '';
}

function isGenericConditionTarget(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  if (/^(any|all|the|record|records|order|orders|item|items|status|state|approved|pending|processing|fulfilled|cancelled|canceled)$/.test(normalized)) {
    return true;
  }
  return false;
}

function isLikelyStandaloneLookup(message: string): boolean {
  const normalized = normalizeText(message);
  const messageWords = words(message);
  if (messageWords.length === 0 || messageWords.length > 4) return false;
  if (/\b(create|update|delete|remove|approve|get|search|list|status|state|order|record|item|cancel|stop)\b/i.test(normalized)) {
    return false;
  }
  return true;
}

export function lookupTextForMessage(message: string): string {
  return extractLookupText(message) || (isLikelyStandaloneLookup(message) ? cleanExtractedText(message) : '');
}

export function extractParamsFromMessage(message: string, tool: Tool): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const field of tool.schema.parameters) {
    const text = `${field.name} ${field.description ?? ''}`;
    if (field.enum?.length) {
      const normalizedMessage = normalizeText(message);
      const matchedEnum = field.enum.find((value) => {
        const normalizedValue = normalizeText(value.replace(/_/g, ' '));
        return normalizedMessage.includes(normalizedValue) || words(value.replace(/_/g, ' ')).some((word) => words(message).includes(word));
      });
      if (matchedEnum) params[field.name] = matchedEnum;
      continue;
    }

    if (field.type === 'number') {
      const direct = message.match(new RegExp(`\\b${field.name}\\b\\s*(?:is|=|:)?\\s*[$]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'))?.[1];
      const money = message.match(/\b(?:worth|amount|valued|costing|priced|for)\s+[$]?\s*(\d+(?:\.\d+)?)/i)?.[1];
      const anyNumber = message.match(/[$]\s*(\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*(?:dollars?|usd)?\b/i);
      const value = direct ?? money ?? anyNumber?.[1] ?? anyNumber?.[2];
      if (value !== undefined) params[field.name] = Number(value);
      continue;
    }

    if (field.type === 'boolean') {
      const lowered = normalizeText(message);
      if (new RegExp(`\\b${field.name}\\b.*\\b(true|yes|enable|enabled|on)\\b`, 'i').test(lowered)) params[field.name] = true;
      if (new RegExp(`\\b${field.name}\\b.*\\b(false|no|disable|disabled|off)\\b`, 'i').test(lowered)) params[field.name] = false;
      continue;
    }

    if (/^id$|uuid|identifier/i.test(text)) {
      const uuid = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
      if (uuid) params[field.name] = uuid;
      continue;
    }

    if (/\b(name|title|email|customer|account|user)\b/i.test(text)) {
      const cleaned = inferNameLikeValue(message);
      if (cleaned) params[field.name] = titleCaseWords(cleaned);
      continue;
    }

    if (/query|search|term|text/i.test(text)) {
      const lookup = lookupTextForMessage(message);
      if (lookup) params[field.name] = lookup;
    }
  }

  return params;
}

export function mergeParams(
  tool: Tool,
  base: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(tool.schema.parameters.map((param) => param.name));
  return Object.fromEntries(
    Object.entries({ ...base, ...next }).filter(([key, value]) => allowed.has(key) && value !== undefined && value !== null)
  );
}
