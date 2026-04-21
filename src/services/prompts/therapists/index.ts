import { CBT_SYSTEM_PROMPT } from './cbt'
import { ACT_SYSTEM_PROMPT } from './act'

export type TherapyType = 'cbt' | 'act'

export interface TherapyAgent {
  id: TherapyType
  label: string
  shortLabel: string
  description: string
  systemPrompt: string
}

export const DEFAULT_THERAPY: TherapyType = 'cbt'

export const THERAPIES: Record<TherapyType, TherapyAgent> = {
  cbt: {
    id: 'cbt',
    label: 'CBT — Cognitive Behavioural Therapy',
    shortLabel: 'CBT',
    description:
      'Identifies and restructures unhelpful thoughts; treats thoughts as hypotheses to examine through evidence.',
    systemPrompt: CBT_SYSTEM_PROMPT,
  },
  act: {
    id: 'act',
    label: 'ACT — Acceptance and Commitment Therapy',
    shortLabel: 'ACT',
    description:
      'Builds psychological flexibility through defusion, acceptance, and values-driven action; never challenges thought content.',
    systemPrompt: ACT_SYSTEM_PROMPT,
  },
}

export function getTherapyPrompt(type: TherapyType | undefined): string {
  if (type && type in THERAPIES) {
    return THERAPIES[type].systemPrompt
  }
  return THERAPIES[DEFAULT_THERAPY].systemPrompt
}

export function listTherapies(): TherapyAgent[] {
  return (Object.keys(THERAPIES) as TherapyType[]).map((k) => THERAPIES[k])
}
