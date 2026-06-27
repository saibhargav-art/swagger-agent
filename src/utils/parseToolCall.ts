export function parseToolCall(
  text: string
): { tool: string; params: Record<string, unknown> } | null {
  if (!text) return null;

  let t = text.replace(/\u2018|\u2019|\u201C|\u201D/g, '"');
  t = t.replace(/^```[a-zA-Z0-9+-]*\n?|```$/g, '');
  t = t.replace(/^`+|`+$/g, '').trim();
  t = t.replace(/^\s*(?:json|javascript|js)\b\s*/i, '').trim();

  const candidates: string[] = [];
  const blockRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call\b[^>]*>|<\/tool_call>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(t)) !== null) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }

  if (candidates.length === 0) {
    candidates.push(t.trim());
  }

  const parsedCandidates: Array<{ tool: string; params: Record<string, unknown> }> = [];

  for (const candidate of candidates) {
    const parsed = parseToolCallCandidate(candidate);
    if (parsed) {
      parsedCandidates.push(parsed);
    }
  }

  if (parsedCandidates.length === 0) return null;

  const withParams = parsedCandidates.filter((c) => Object.keys(c.params).length > 0);
  if (withParams.length > 0) {
    return withParams[withParams.length - 1];
  }

  return parsedCandidates[parsedCandidates.length - 1];
}

function normalizeJsonText(json: string): string {
  let cleaned = json.trim();
  cleaned = cleaned.replace(/^['"`]?\s*(?:json|javascript|js)\b\s*['"`]?/i, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''));
  cleaned = cleaned.replace(/^`+|`+$/g, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  cleaned = cleaned.replace(/,\s*(?=[}\]])/g, '');
  return cleaned;
}

function parseNamedToolCall(content: string): { tool: string; params: Record<string, unknown> } | null {
  const toolMatch = content.match(/['"]?tool['"]?\s*[:=]\s*['"]?([A-Za-z0-9_\-]+)['"]?/i);
  if (!toolMatch) return null;

  const tool = toolMatch[1];
  const paramsMatch = content.match(/['"]?params['"]?\s*[:=]\s*([\s\S]*)$/i);
  let paramsText = paramsMatch?.[1]?.trim() ?? '{}';

  if (!paramsText.startsWith('{')) {
    paramsText = `{${paramsText.replace(/(^,|,$)/g, '')}}`;
  }

  const safeJson = normalizeJsonText(paramsText)
    .replace(/([\{,\s])([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"');

  try {
    const params = JSON.parse(safeJson);
    if (params && typeof params === 'object') {
      return { tool, params };
    }
  } catch {
    // fall through
  }

  return null;
}

function parseToolCallCandidate(
  content: string
): { tool: string; params: Record<string, unknown> } | null {
  const trimmed = content.trim();

  const jsonCandidate = normalizeJsonText(trimmed);
  if (jsonCandidate.startsWith('{') && jsonCandidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.tool !== 'string') {
        return null;
      }
      if (!parsed.params || typeof parsed.params !== 'object') {
        return null;
      }
      return { tool: parsed.tool, params: parsed.params as Record<string, unknown> };
    } catch {
      // fall through
    }
  }

  const named = parseNamedToolCall(trimmed);
  if (named) return named;

  const normalized = trimmed.replace(/^[\s-]+/, '').trim();
  const toolParamsMatch = normalized.match(/^([A-Za-z0-9_\-]+)\s*,\s*(.*)$/s);
  if (!toolParamsMatch) return null;

  const tool = toolParamsMatch[1];
  let paramsText = toolParamsMatch[2].trim();
  if (!paramsText.startsWith('{')) {
    paramsText = `{${paramsText.replace(/(^,|,$)/g, '')}}`;
  }

  const safeJson = normalizeJsonText(paramsText)
    .replace(/([\{,\s])([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"');

  try {
    const params = JSON.parse(safeJson);
    if (params && typeof params === 'object') {
      return { tool, params };
    }
  } catch {
    // fall through
  }

  return null;
}

export function toDisplayContent(text: string): string {
  const cleaned = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
  if (!cleaned && parseToolCall(text)) return '';
  return cleaned;
}
