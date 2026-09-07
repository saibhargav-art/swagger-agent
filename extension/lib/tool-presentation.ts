import type { WebMcpTool } from '../shared/webmcp'

export type PresentationSection = {
  title: string
  rows: Array<{ label?: string; value: string }>
  sample?: string
  fields?: PresentationField[]
}

export type PresentationField = {
  name: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  showWhen?: { field: string; equals: string }
}

export type PresentationFormAction = {
  tool: string
  label: string
  input?: Record<string, unknown>
}

export type ToolPresentation = {
  kind: 'missing' | 'preview' | 'success' | 'info'
  title: string
  message?: string
  sections: PresentationSection[]
  sample?: string
  nextAction?: string
  nextActionInput?: Record<string, unknown>
  confirmationRequired?: boolean
  actionLabel?: string
  loadingLabel?: string
  editAction?: string
  formAction?: PresentationFormAction
}

export function createToolPresentation(result: unknown, tool: WebMcpTool): ToolPresentation | null {
  const value = record(result)
  if (!value) return null

  const missing = firstRecord(value, ['missingByTab', 'missingBySection'])
  if (missing) {
    return {
      kind: 'missing',
      title: 'More information needed',
      message: stringValue(value.message),
      sections: Object.entries(missing).map(([name, sectionValue]) => missingSection(name, sectionValue)),
      sample: stringValue(value.sampleReply),
      nextAction: stringValue(value.nextAction),
      nextActionInput: record(value.nextActionInput) || undefined,
      confirmationRequired: value.confirmationRequired === true,
      actionLabel: stringValue(value.actionLabel),
      loadingLabel: stringValue(value.loadingLabel),
      editAction: stringValue(value.editAction),
      formAction: parseFormAction(value.formAction),
    }
  }

  const captured = firstRecord(value, ['capturedByTab', 'capturedBySection', 'sections', 'preview'])
  const status = stringValue(value.status)
  if (!captured && (status === 'submitted' || status === 'already_submitted')) {
    return {
      kind: 'success',
      title: presentationTitle(status, tool),
      message: stringValue(value.message),
      sections: Array.isArray(value.summary)
        ? [{ title: 'Result', rows: value.summary.map((item) => ({ value: displayValue(item) })) }]
        : [],
    }
  }
  if (!captured) return null
  return {
    kind: ['submitted', 'already_submitted', 'created', 'completed'].includes(status || '')
      ? 'success'
      : status === 'ready_for_confirmation' || status === 'ready_for_review'
        ? 'preview'
        : 'info',
    title: presentationTitle(status, tool),
    message: stringValue(value.message),
    sections: Object.entries(captured).map(([name, sectionValue]) => capturedSection(name, sectionValue)),
    sample: stringValue(value.sampleReply),
    nextAction: stringValue(value.nextAction),
    nextActionInput: record(value.nextActionInput) || undefined,
    confirmationRequired: value.confirmationRequired === true,
    actionLabel: stringValue(value.actionLabel),
    loadingLabel: stringValue(value.loadingLabel),
    editAction: stringValue(value.editAction),
    formAction: parseFormAction(value.formAction),
  }
}

function missingSection(name: string, value: unknown): PresentationSection {
  const section = record(value)
  if (!section) return { title: label(name), rows: [{ value: displayValue(value) }] }
  const fields = Array.isArray(section.fields) ? section.fields : []
  const formFields = fields.map(parseField).filter((field): field is PresentationField => Boolean(field))
  return {
    title: stringValue(section.tab) || label(name),
    rows: formFields.length ? [] : fields.map((field) => ({ value: displayValue(field) })),
    sample: stringValue(section.sampleReply),
    fields: formFields,
  }
}

function parseField(value: unknown): PresentationField | null {
  const field = record(value)
  const name = field && stringValue(field.name)
  if (!field || !name) return null
  const options = Array.isArray(field.options)
    ? field.options.map((option) => {
      const item = record(option)
      const optionValue = item && stringValue(item.value)
      return item && optionValue ? { label: stringValue(item.label) || optionValue, value: optionValue } : null
    }).filter((option): option is { label: string; value: string } => Boolean(option))
    : undefined
  const condition = record(field.showWhen)
  const conditionField = condition && stringValue(condition.field)
  const conditionValue = condition && stringValue(condition.equals)
  return {
    name,
    label: stringValue(field.label) || label(name),
    type: stringValue(field.type) || 'text',
    placeholder: stringValue(field.placeholder),
    required: field.required !== false,
    options,
    showWhen: conditionField && conditionValue ? { field: conditionField, equals: conditionValue } : undefined,
  }
}

function parseFormAction(value: unknown): PresentationFormAction | undefined {
  const action = record(value)
  const tool = action && stringValue(action.tool)
  if (!action || !tool) return undefined
  return {
    tool,
    label: stringValue(action.label) || 'Continue',
    input: record(action.input) || undefined,
  }
}

function capturedSection(name: string, value: unknown): PresentationSection {
  const section = record(value)
  if (!section) return { title: label(name), rows: [{ value: displayValue(value) }] }
  const rows = Object.entries(section)
    .filter(([key, rowValue]) => key !== 'status' && rowValue != null && rowValue !== '')
    .map(([key, rowValue]) => ({ label: label(key), value: displayValue(rowValue) }))
  return { title: label(name), rows }
}

function presentationTitle(status: string | undefined, tool: WebMcpTool) {
  if (status === 'ready_for_confirmation') return 'Review details'
  if (status === 'ready_for_review') return 'Ready for review'
  if (status === 'submitted') return 'Completed'
  if (status === 'already_submitted') return 'Already completed'
  if (status === 'created' || status === 'completed') return 'Completed'
  return tool.title || label(tool.name)
}

function firstRecord(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = record(value[key])
    if (candidate) return candidate
  }
  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value == null) return '-'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${label(key)}: ${displayValue(item)}`)
    .join(', ')
  return String(value)
}

export function label(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
