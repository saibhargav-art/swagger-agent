import { createSignal } from 'solid-js'

import type { ModelSettings } from '../lib/agent-client'

type Props = {
  settings: ModelSettings
  onSave: (settings: ModelSettings) => Promise<void>
}

export default function SettingsView(props: Props) {
  const [provider, setProvider] = createSignal(props.settings.provider)
  const [apiKey, setApiKey] = createSignal(props.settings.apiKey)
  const [modelId, setModelId] = createSignal(props.settings.modelId)
  const [saved, setSaved] = createSignal(false)

  const chooseProvider = (value: ModelSettings['provider']) => {
    setProvider(value)
    setModelId(value === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-latest')
    setSaved(false)
  }

  const save = async () => {
    await props.onSave({ provider: provider(), apiKey: apiKey().trim(), modelId: modelId().trim() })
    setSaved(true)
  }

  return (
    <section class="settings-view">
      <h2>Model settings</h2>
      <p>The key is stored in this extension and sent only to the local Strands service.</p>

      <div class="provider-options" role="group" aria-label="Model provider">
        <button classList={{ selected: provider() === 'openai' }} onClick={() => chooseProvider('openai')}>OpenAI</button>
        <button classList={{ selected: provider() === 'anthropic' }} onClick={() => chooseProvider('anthropic')}>Claude</button>
      </div>

      <label>
        <span>API key</span>
        <input type="password" value={apiKey()} placeholder={provider() === 'openai' ? 'OpenAI API key' : 'Anthropic API key'}
          onInput={(event) => { setApiKey(event.currentTarget.value); setSaved(false) }} />
      </label>
      <label>
        <span>Model</span>
        <input value={modelId()} onInput={(event) => { setModelId(event.currentTarget.value); setSaved(false) }} />
      </label>

      <div class="settings-actions">
        <span>{saved() ? 'Saved' : ''}</span>
        <button class="primary" disabled={!apiKey().trim() || !modelId().trim()} onClick={() => void save()}>Save settings</button>
      </div>
    </section>
  )
}
