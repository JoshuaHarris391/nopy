import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const idbStore = new Map<unknown, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: unknown) => idbStore.get(key)),
  set: vi.fn(async (key: unknown, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: unknown) => {
    idbStore.delete(key)
  }),
}))
/** A raw-canvas animation loop; jsdom has no canvas. */
vi.mock('../../components/profile/LeafCatcherGame', () => ({ LeafCatcherGame: () => <div>game</div> }))

import { ProfileView } from '../../components/profile/ProfileView'
import { useProfileStore, toVersionMeta } from '../../stores/profileStore'
import { useJournalStore } from '../../stores/journalStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { makeEntry } from '../fixtures/insight'
import type { PsychologicalProfile } from '../../types/profile'

function makeProfile(overrides: Partial<PsychologicalProfile> = {}): PsychologicalProfile {
  return {
    summary: 'A brief profile summary.', themes: [{ theme: 'work', frequency: 5, description: 'd' }], cognitivePatterns: [],
    strengths: ['Keeps going'], growthAreas: [], frameworkInsights: [], emotionalTrends: [],
    averageMood: 6, avgEntryLength: 120, reflectionDepth: 'Medium', journalingStreak: 2,
    entriesAnalyzed: 3, updatedAt: '2025-03-02T10:00:00.000Z', fullProfile: '# Full',
    scope: { kind: 'all' },
    ...overrides,
  }
}

describe('Profile page: AI content, scope and history', () => {
  const older = makeProfile({ id: 'v1', createdAt: '2025-03-01T10:00:00.000Z', updatedAt: '2025-03-01T10:00:00.000Z' })
  const newer = makeProfile({ id: 'v2', createdAt: '2025-03-02T10:00:00.000Z', isRevision: true, basedOn: 'v1' })

  beforeEach(() => {
    idbStore.clear()
    localStorage.clear()
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'anthropic', privateMode: false, profileScope: { kind: 'all' } })
    useJournalStore.setState({
      entries: [
        makeEntry({ id: 'e1', createdAt: '2025-01-05T10:00:00.000Z' }),
        makeEntry({ id: 'e2', createdAt: '2025-02-05T10:00:00.000Z' }),
        makeEntry({ id: 'e3', createdAt: '2025-03-05T10:00:00.000Z' }),
      ],
      loaded: true,
      lastError: null,
    })
    useProfileStore.setState({ profile: newer, versions: [toVersionMeta(newer), toVersionMeta(older)], loaded: true, generating: false })
  })
  afterEach(() => {
    cleanup()
  })

  it('shows only the AI-generated profile, with the version history and the one in use marked', () => {
    /**
     * After the split the Profile page holds the generated content and its
     * controls; the mood chart and metric cards moved to Insights. The
     * history lists every generation newest first, marks the selected one
     * and offers Use / delete on the others only.
     * Input: two versions, the newer selected.
     * Expected: summary and themes visible, no "Mood over time"; two
     * history rows, the first "In use" with no delete, the second with Use
     * and a delete button; clicking Use selects v1.
     */
    const selectVersion = vi.fn(async () => {})
    useProfileStore.setState({ selectVersion })
    render(<MemoryRouter><ProfileView /></MemoryRouter>)

    expect(screen.getByText('A brief profile summary.')).toBeInTheDocument()
    expect(screen.getByText('work')).toBeInTheDocument()
    expect(screen.queryByText(/Mood over time/i)).toBeNull()
    expect(screen.getByTestId('profile-selected-line')).toHaveTextContent('3 entries · all entries')

    const rows = screen.getAllByTestId('history-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByTestId('history-in-use')).toBeInTheDocument()
    expect(within(rows[0]).queryByTestId('history-delete')).toBeNull()
    expect(within(rows[0]).getByText(/Revision of 1 Mar 2025/)).toBeInTheDocument()
    expect(within(rows[1]).getByTestId('history-delete')).toBeInTheDocument()

    fireEvent.click(within(rows[1]).getByTestId('history-use'))
    expect(selectVersion).toHaveBeenCalledWith('v1')
  })

  it('scopes the next generation from the header control and passes every entry to the store', () => {
    /**
     * The scope control writes the setting and the count line shows how
     * many indexed entries the next generation will use; the store applies
     * the scope itself, so Generate hands it the whole journal.
     * Input: choose "Last N entries" (defaults to 60, then set 2); click
     * Generate.
     * Expected: settings profileScope becomes entries/2, the count line says
     * 2 of 3, and generateProfile is called with all three entries.
     */
    const generateProfile = vi.fn(async () => {})
    useProfileStore.setState({ generateProfile })
    render(<MemoryRouter><ProfileView /></MemoryRouter>)

    expect(screen.getByTestId('scope-count')).toHaveTextContent('3 of 3 indexed entries (all entries)')
    fireEvent.change(screen.getByRole('combobox', { name: 'Profile scope' }), { target: { value: 'entries' } })
    expect(useSettingsStore.getState().profileScope).toEqual({ kind: 'entries', count: 60 })
    const count = screen.getByRole('spinbutton', { name: 'Number of entries' })
    fireEvent.blur(count, { target: { value: '2' } })
    expect(useSettingsStore.getState().profileScope).toEqual({ kind: 'entries', count: 2 })
    expect(screen.getByTestId('scope-count')).toHaveTextContent('2 of 3 indexed entries (last 2 entries)')

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(generateProfile).toHaveBeenCalledTimes(1)
    expect((generateProfile.mock.calls[0] as unknown[])[0]).toHaveLength(3)
  })
})
