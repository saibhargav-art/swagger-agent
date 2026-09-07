import { For, Show, createSignal } from 'solid-js'

import type { ToolPresentation } from '../lib/tool-presentation'

type Props = {
  presentation: ToolPresentation
  onUseSample: (sample: string) => void
  onAction: (presentation: ToolPresentation) => void
  onFormAction: (presentation: ToolPresentation, values: Record<string, unknown>) => void
  busy: boolean
}

export default function ToolResultCard(props: Props) {
  const [values, setValues] = createSignal<Record<string, string>>({})
  const visible = (field: NonNullable<(typeof props.presentation.sections)[number]['fields']>[number]) =>
    !field.showWhen || values()[field.showWhen.field] === field.showWhen.equals
  const canContinue = () => props.presentation.sections
    .flatMap((section) => section.fields || [])
    .filter(visible)
    .every((field) => !field.required || Boolean(values()[field.name]?.trim()))
  const formValues = () => Object.fromEntries(props.presentation.sections
    .flatMap((section) => section.fields || [])
    .filter(visible)
    .filter((field) => values()[field.name]?.trim())
    .map((field) => [field.name, field.type === 'number' ? Number(values()[field.name]) : values()[field.name]]))

  return (
    <article classList={{ 'tool-result-card': true, [props.presentation.kind]: true }}>
      <div class="tool-result-heading">
        <h3>{props.presentation.title}</h3>
        <span>{statusLabel(props.presentation.kind)}</span>
      </div>
      <Show when={props.presentation.message}><p class="tool-result-message">{props.presentation.message}</p></Show>
      <div class="tool-result-sections">
        <For each={props.presentation.sections}>{(section) => (
          <section>
            <h4>{section.title}</h4>
            <For each={section.rows}>{(row) => (
              <p><Show when={row.label}><b>{row.label}: </b></Show>{row.value}</p>
            )}</For>
            <Show when={section.fields?.length}>
              <div class="tool-result-fields">
                <For each={section.fields}>{(field) => (
                  <Show when={visible(field)}>
                    <label>
                      <span>{field.label}{field.required ? ' *' : ''}</span>
                      <Show when={field.options?.length} fallback={
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={values()[field.name] || ''}
                          onInput={(event) => setValues((current) => ({ ...current, [field.name]: event.currentTarget.value }))}
                        />
                      }>
                        <select
                          value={values()[field.name] || ''}
                          onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.currentTarget.value }))}
                        >
                          <option value="">Select</option>
                          <For each={field.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
                        </select>
                      </Show>
                    </label>
                  </Show>
                )}</For>
              </div>
            </Show>
            <Show when={section.sample}>{(sample) => (
              <div class="tool-result-section-sample">
                <code>{sample()}</code>
                <button class="secondary" onClick={() => props.onUseSample(sample())}>Add sample</button>
              </div>
            )}</Show>
          </section>
        )}</For>
      </div>
      <Show when={props.presentation.formAction}>{(action) => (
        <div class="tool-result-action">
          <button
            class="primary"
            disabled={props.busy || !canContinue()}
            onClick={() => props.onFormAction(props.presentation, formValues())}
          >
            {action().label}
          </button>
        </div>
      )}</Show>
      <Show when={props.presentation.sample}>{(sample) => (
        <div class="tool-result-sample">
          <code>{sample()}</code>
          <button class="secondary" onClick={() => props.onUseSample(sample())}>Add all samples</button>
        </div>
      )}</Show>
      <Show when={props.presentation.actionLabel}>{(actionLabel) => (
        <div class="tool-result-action">
          <button class="primary" disabled={props.busy} onClick={() => props.onAction(props.presentation)}>
            <Show when={props.busy} fallback={actionLabel()}>
              <span class="button-spinner" aria-hidden="true" />
              {props.presentation.loadingLabel || 'Processing...'}
            </Show>
          </button>
        </div>
      )}</Show>
    </article>
  )
}

function statusLabel(kind: ToolPresentation['kind']) {
  if (kind === 'missing') return 'Needs input'
  if (kind === 'preview') return 'Review'
  if (kind === 'success') return 'Done'
  return 'Update'
}
