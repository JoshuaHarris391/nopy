import type { ZodSchema } from 'zod'

export class LLMParseError extends Error {
  raw: string
  constructor(message: string, raw: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'LLMParseError'
    this.raw = raw
  }
}

export function parseLLMJson<T>(raw: string, schema: ZodSchema<T>): T {
  // Strip markdown code fences
  let cleaned = raw
    .replace(/^```(?:json)?\n?/gm, '')
    .replace(/^```\n?/gm, '')
    .trim()

  // If there's trailing prose after the JSON, extract just the JSON
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new LLMParseError('Failed to parse LLM response as JSON', raw, e)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new LLMParseError(
      `LLM response failed schema validation: ${result.error.message}`,
      raw,
      result.error,
    )
  }
  return result.data
}
