import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseLLMJson, LLMParseError } from '../../services/parseLLMJson'

const TestSchema = z.object({ value: z.number() })

describe('parseLLMJson', () => {
  it('parses plain JSON and validates against the schema', () => {
    const result = parseLLMJson('{"value": 7}', TestSchema)
    expect(result).toEqual({ value: 7 })
  })

  it('strips markdown json code fences before parsing', () => {
    const result = parseLLMJson('```json\n{"value": 7}\n```', TestSchema)
    expect(result).toEqual({ value: 7 })
  })

  it('strips fences with trailing prose after the closing fence', () => {
    const result = parseLLMJson('```json\n{"value": 7}\n```\nHere is the result.', TestSchema)
    expect(result).toEqual({ value: 7 })
  })

  it('throws LLMParseError on invalid JSON', () => {
    expect(() => parseLLMJson('{invalid', TestSchema)).toThrow(LLMParseError)
  })

  it('throws LLMParseError on valid JSON that fails the schema', () => {
    expect(() => parseLLMJson('{"wrong": "shape"}', TestSchema)).toThrow(LLMParseError)
  })
})
