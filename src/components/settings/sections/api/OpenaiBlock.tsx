import { SettingsRow } from '../../../ui/SettingsRow'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useOpenaiModels } from '../../../../hooks/useProviderModels'
import { ApiKeyField } from './ApiKeyField'
import { ModelSelect } from './ModelSelect'

/**
 * OpenAI-mode settings block: API key input + model dropdown. Mirrors
 * AnthropicBlock so the parent can mount any of the three provider blocks
 * under the toggle without conditional rendering noise.
 */
export function OpenaiBlock() {
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey)
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey)
  const openaiModel = useSettingsStore((s) => s.openaiModel)
  const setOpenaiModel = useSettingsStore((s) => s.setOpenaiModel)
  const lightweightModel = useSettingsStore((s) => s.openaiLightweightModel)
  const setLightweightModel = useSettingsStore((s) => s.setOpenaiLightweightModel)

  const { models, loading: modelsLoading, error: modelsError } = useOpenaiModels(openaiApiKey)

  return (
    <>
      <ApiKeyField
        label="OpenAI API Key"
        description="Your key stays local and is never sent to any server other than OpenAI's API."
        placeholder="sk-..."
        initialValue={openaiApiKey}
        onCommit={setOpenaiApiKey}
      />

      <SettingsRow label="Main model" description="Used for chat replies and full-profile generation">
        <ModelSelect
          value={openaiModel}
          onChange={setOpenaiModel}
          models={models}
          loading={modelsLoading}
          error={modelsError}
          apiKey={openaiApiKey}
          emptyOption={{ label: 'Select a model…', mode: 'when-unset' }}
        />
      </SettingsRow>

      <SettingsRow label="Lightweight model" description="Used for entry indexing, summary profiles, and chat titles. Leave blank to reuse the main model.">
        <ModelSelect
          value={lightweightModel}
          onChange={setLightweightModel}
          models={models}
          loading={modelsLoading}
          error={modelsError}
          apiKey={openaiApiKey}
          emptyOption={{ label: 'Use main model', mode: 'always' }}
          hideNoModels
        />
      </SettingsRow>
    </>
  )
}
