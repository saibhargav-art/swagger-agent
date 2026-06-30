import type { Tool } from '@/types/tool';
import { humanizeToolName, normalizeText, words } from './AgentText';

export function summarizeToolResult(toolName: string, result: unknown): string {
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

export function applyPromptResultFilterForTool(result: unknown, sourceText: string, tool?: Tool): unknown {
  if (!Array.isArray(result) || !sourceText.trim()) return result;

  const records = result.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  );
  if (records.length === 0) return result;

  const duplicateRecords = filterDuplicateRecords(records, sourceText, tool);
  if (duplicateRecords) return duplicateRecords;

  const metadataKeys = tool?.metadata?.filterable ?? [];
  const filterKeys = [
    ...new Set([
      ...metadataKeys,
      ...records.flatMap((record) =>
        Object.keys(record).filter((key) => /status|state|type|category|name|customer|account|user/i.test(key))
      ),
    ]),
  ];
  if (filterKeys.length === 0) return result;

  const filtered = filterRecordsByPrompt(records, sourceText, filterKeys);
  if (filtered) return filtered;

  return result;
}

function filterDuplicateRecords(records: Array<Record<string, unknown>>, sourceText: string, tool?: Tool) {
  const sourceWords = new Set(words(sourceText));
  const asksForDuplicates = ['duplicate', 'repeated', 'same'].some((word) => sourceWords.has(word));
  if (!asksForDuplicates) return null;

  const requestedName = ['name', 'customer', 'account', 'user', 'title', 'email'].some((word) => sourceWords.has(word));
  const metadataField = tool?.metadata?.displayField;
  const candidateKeys = [
    ...(metadataField ? [metadataField] : []),
    ...Object.keys(records[0] ?? {}).filter((key) =>
      requestedName
        ? /name|customer|account|user|title|email/i.test(key)
        : !/^(id|.*_id|uuid|created_at|updated_at)$/i.test(key)
    ),
  ];

  for (const key of [...new Set(candidateKeys)]) {
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const record of records) {
      const value = record[key];
      if (value === undefined || value === null || String(value).trim() === '') continue;
      const normalized = normalizeText(String(value));
      groups.set(normalized, [...(groups.get(normalized) ?? []), record]);
    }

    const duplicates = [...groups.values()].filter((group) => group.length > 1).flat();
    if (duplicates.length > 0) return duplicates;
  }

  return [];
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
    const values = [
      ...new Set(
        records
          .map((record) => record[key])
          .filter((value) => value !== undefined && value !== null)
          .map(String)
      ),
    ];
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
