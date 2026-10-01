import { SettingsRow } from '../../../ui/SettingsRow'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useVeniceModels } from '../../../../hooks/useProviderModels'
import { ApiKeyField } from './ApiKeyField'
import { ModelSelect } from './ModelSelect'

/**
 * Venice-mode settings block: API key input + model dropdown. Mirrors
 * OpenaiBlock so the parent can mount any of the provider blocks under the
 * toggle without conditional rendering noise. Venice is OpenAI-compatible,
 * so the only user-visible differences are the key label/copy and the model
 * list source.
 */
export function VeniceBlock() {
  const veniceApiKey = useSettingsStore((s) => s.veniceApiKey)
  const setVeniceApiKey = useSettingsStore((s) => s.setVeniceApiKey)
  const veniceModel = useSettingsStore((s) => s.veniceModel)
  const setVeniceModel = useSettingsStore((s) => s.setVeniceModel)
  const lightweightModel = useSettingsStore((s) => s.veniceLightweightModel)
  const setLightweightModel = useSettingsStore((s) => s.setVeniceLightweightModel)

  const { models, loading: modelsLoading, error: modelsError } = useVeniceModels(veniceApiKey)

  return (
    <>
      <ApiKeyField
        label="Venice API Key"
        description="Your key stays local and is never sent to any server other than Venice's API."
        placeholder="venice-..."
        initialValue={veniceApiKey}
        onCommit={setVeniceApiKey}
      />

      <SettingsRow label="Main model" description="Used for chat replies and full-profile generation">
        <ModelSelect
          value={veniceModel}
          onChange={setVeniceModel}
          models={models}
          loading={modelsLoading}
          error={modelsError}
          apiKey={veniceApiKey}
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
          apiKey={veniceApiKey}
          emptyOption={{ label: 'Use main model', mode: 'always' }}
          hideNoModels
        />
      </SettingsRow>
    </>
  )
}
