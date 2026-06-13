import { SettingsRow } from '../../../ui/SettingsRow'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useAnthropicModels } from '../../../../hooks/useProviderModels'
import { ApiKeyField } from './ApiKeyField'
import { ModelSelect } from './ModelSelect'

/**
 * Anthropic-mode settings block: API key input + model dropdown. Extracted
 * from the original ApiSection so the parent can mount either this or
 * LocalBlock under the provider toggle without conditional rendering noise.
 */
export function AnthropicBlock() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const setApiKey = useSettingsStore((s) => s.setApiKey)
  const preferredModel = useSettingsStore((s) => s.preferredModel)
  const setPreferredModel = useSettingsStore((s) => s.setPreferredModel)
  const lightweightModel = useSettingsStore((s) => s.anthropicLightweightModel)
  const setLightweightModel = useSettingsStore((s) => s.setAnthropicLightweightModel)

  const { models, loading: modelsLoading, error: modelsError } = useAnthropicModels(apiKey)

  return (
    <>
      <ApiKeyField
        label="Anthropic API Key"
        description="Your key stays local and is never sent to any server other than Anthropic's API."
        placeholder="sk-ant-..."
        initialValue={apiKey}
        onCommit={setApiKey}
      />

      <SettingsRow label="Main model" description="Used for chat replies and full-profile generation">
        <ModelSelect
          value={preferredModel}
          onChange={setPreferredModel}
          models={models}
          loading={modelsLoading}
          error={modelsError}
          apiKey={apiKey}
        />
      </SettingsRow>

      <SettingsRow label="Lightweight model" description="Used for entry indexing, summary profiles, and chat titles — pick a smaller/cheaper model">
        <ModelSelect
          value={lightweightModel}
          onChange={setLightweightModel}
          models={models}
          loading={modelsLoading}
          error={modelsError}
          apiKey={apiKey}
        />
      </SettingsRow>
    </>
  )
}
