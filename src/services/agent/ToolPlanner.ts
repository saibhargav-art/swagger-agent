import type { Conversation } from '@/types/chat';
import type { Tool } from '@/types/tool';
import type { AIProvider, ChatMessage } from '@/providers/types';

export interface ToolPlan {
  tool: string | null;
  params: Record<string, unknown>;
  lookupText?: string;
  confidence?: number;
}

interface PlannerOptions {
  forcedTool?: Tool;
  knownParams?: Record<string, unknown>;
}

export class ToolPlanner {
  async plan(
    provider: AIProvider,
    tools: Tool[],
    conversation: Conversation,
    userContent: string,
    options: PlannerOptions = {}
  ): Promise<ToolPlan | null> {
    const response = await provider.chat([
      {
        role: 'system',
        content: buildPlannerPrompt(options.forcedTool ? [options.forcedTool] : tools, options),
      },
      ...recentHistory(conversation),
      { role: 'user', content: userContent },
    ]);

    return parsePlan(response, options.forcedTool);
  }
}

function recentHistory(conversation: Conversation): ChatMessage[] {
  return conversation.messages
    .filter((message) => !message.isStreaming)
    .slice(-8)
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
}

function buildPlannerPrompt(tools: Tool[], options: PlannerOptions): string {
  const catalog = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    intent: tool.metadata?.intent,
    requiresConfirmation: tool.metadata?.requiresConfirmation,
    params: tool.schema.parameters.map((param) => ({
      name: param.name,
      type: param.type,
      required: param.required,
      enum: param.enum,
      description: param.description,
    })),
    filterable: tool.metadata?.filterable ?? [],
    searchable: tool.metadata?.searchable ?? [],
    recordIdField: tool.metadata?.recordIdField,
    displayField: tool.metadata?.displayField,
    resolveIdWith: tool.metadata?.resolveIdWith,
  }));

  return `You are a tool planner for a connected app.

Return only one JSON object. Do not return markdown, prose, XML, or code fences.

Schema:
{
  "tool": "exact tool name from catalog, or null",
  "params": { "schema_param": "value" },
  "lookupText": "human record reference, if any",
  "confidence": 0.0
}

Rules:
- Pick the best exact tool name from the tool catalog.
- If the user is not asking for something the connected app can do, return {"tool":null,"params":{},"confidence":0}.
- Extract only values that are clearly present in the user message.
- Never invent parameter values.
- If a required "id" or UUID field is needed but the user gave a human name/text, do not put that text in "id". Put it in "lookupText".
- Only put an id/UUID value in params when the user provided an actual UUID.
- For create actions, put name-like values into the matching name/customer/account parameter when present.
- For enum fields, choose only one of the provided enum values.
- For read/list/search requests with conditions, choose the broadest read/search/list tool that can return records; the app may filter returned records using filterable metadata.
- Do not choose create/update/delete/approve/write tools unless the user explicitly asks to create, update, delete, approve, or otherwise change data.
- For prompts asking to search, find, list, check, show, compare, count, detect duplicates, or inspect records, choose a read/search/list tool.
- If no connected tool matches, return {"tool":null,"params":{},"confidence":0}.
${options.forcedTool ? `- You must plan only for this pending tool: ${options.forcedTool.name}.` : ''}
${options.knownParams ? `Known params already collected: ${JSON.stringify(options.knownParams)}` : ''}

Tool catalog:
${JSON.stringify(catalog, null, 2)}`;
}

function parsePlan(text: string, forcedTool?: Tool): ToolPlan | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  const tool = typeof parsed.tool === 'string' && parsed.tool.trim()
    ? parsed.tool.trim()
    : forcedTool?.name ?? null;

  const params = parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
    ? parsed.params as Record<string, unknown>
    : {};
  const lookupText = typeof parsed.lookupText === 'string' && parsed.lookupText.trim()
    ? parsed.lookupText.trim()
    : undefined;
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : undefined;

  return { tool, params, lookupText, confidence };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/\u2018|\u2019|\u201C|\u201D/g, '"')
    .replace(/^```[a-zA-Z0-9+-]*\n?|```$/g, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1).replace(/,\s*(?=[}\]])/g, ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export const toolPlanner = new ToolPlanner();
