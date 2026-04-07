import Anthropic from '@anthropic-ai/sdk'

let clientInstance: Anthropic | null = null
let currentApiKey = ''

export function getClient(apiKey: string): Anthropic {
  if (clientInstance && currentApiKey === apiKey) return clientInstance
  clientInstance = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  currentApiKey = apiKey
  return clientInstance
}

export async function streamChatResponse(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  onChunk: (fullText: string) => void,
  onComplete: (fullText: string) => void,
  onError: (error: Error) => void,
): Promise<void> {
  try {
    const client = getClient(apiKey)
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    })

    let fullText = ''

    stream.on('text', (text) => {
      fullText += text
      onChunk(fullText)
    })

    stream.on('finalMessage', () => {
      onComplete(fullText)
    })

    stream.on('error', (error) => {
      onError(error instanceof Error ? error : new Error(String(error)))
    })
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function fetchModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
  const client = getClient(apiKey)
  const response = await client.models.list({ limit: 100 })
  return response.data
    .filter((m) => m.id.startsWith('claude-'))
    .map((m) => ({ id: m.id, displayName: m.display_name ?? m.id }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function sendMessage(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  const client = getClient(apiKey)
  const response = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages,
    },
    { signal },
  )
  const block = response.content[0]
  return block?.type === 'text' ? block.text : ''
}
