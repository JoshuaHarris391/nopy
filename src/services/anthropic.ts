import Anthropic from '@anthropic-ai/sdk'

let clientInstance: Anthropic | null = null
let currentApiKey = ''

export function getClient(apiKey: string): Anthropic {
  if (clientInstance && currentApiKey === apiKey) {
    console.log('[anthropic] getClient: reusing existing client')
    return clientInstance
  }
  console.log('[anthropic] getClient: creating new client instance')
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
  console.log('[anthropic] streamChatResponse: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
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
    console.log('[anthropic] streamChatResponse: complete —', fullText.length, 'chars received')
    onComplete(fullText)
  })

  stream.on('error', (error) => {
    console.error('[anthropic] streamChatResponse: stream error —', error instanceof Error ? error.message : String(error))
    onError(error instanceof Error ? error : new Error(String(error)))
  })
}

export async function fetchModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
  console.log('[anthropic] fetchModels: requesting model list')
  const client = getClient(apiKey)
  const response = await client.models.list({ limit: 100 })
  const filtered = response.data
    .filter((m) => m.id.startsWith('claude-'))
    .map((m) => ({ id: m.id, displayName: m.display_name ?? m.id }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  console.log('[anthropic] fetchModels: total', response.data.length, '| after claude filter', filtered.length)
  return filtered
}

export async function sendMessage(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number = 500,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[anthropic] sendMessage: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
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
  const text = block?.type === 'text' ? block.text : ''
  console.log('[anthropic] sendMessage: response', text.length, 'chars | stop_reason', response.stop_reason)
  return text
}

export async function sendMessageStreaming(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  maxTokens: number,
  onProgress: (charsReceived: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  console.log('[anthropic] sendMessageStreaming: model', model, '| messages', messages.length, '| maxTokens', maxTokens)
  const client = getClient(apiKey)
  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages,
    },
    { signal },
  )

  let fullText = ''
  stream.on('text', (text) => {
    fullText += text
    onProgress(fullText.length)
  })

  await stream.finalMessage()
  console.log('[anthropic] sendMessageStreaming: complete —', fullText.length, 'chars')
  return fullText
}
