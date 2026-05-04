import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NotificationCard } from '../../components/ui/NotificationCard'

afterEach(() => {
  cleanup()
})

describe('NotificationCard', () => {
  it('renders title only when no description / progress / dismiss are provided', () => {
    /**
     * The minimum-render case — used by the existing indexing card when
     * the progress total is zero. Just a title in a parchment box.
     */
    render(<NotificationCard title="Indexing..." />)
    expect(screen.getByText('Indexing...')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders description below the title', () => {
    /**
     * Profile-gen uses description for the "phase" line ("Step 3/5 —
     * Writing full psychological profile"). Chat-error notifications use
     * it for the actionable error message.
     */
    render(<NotificationCard title="Generating profile..." description="Step 3/5 — Writing full profile" />)
    expect(screen.getByText('Generating profile...')).toBeInTheDocument()
    expect(screen.getByText('Step 3/5 — Writing full profile')).toBeInTheDocument()
  })

  it('renders an inline ProgressBar when progress prop is provided', () => {
    /**
     * Drives the existing "1234 chars received" rendering for streaming
     * profile generation. ProgressBar shows the label on the left and
     * the count ratio on the right.
     */
    render(<NotificationCard title="Generating..." progress={{ current: 1234, total: 8000, label: '1234 chars received' }} />)
    expect(screen.getByText('1234 chars received')).toBeInTheDocument()
    expect(screen.getByText('1234/8000')).toBeInTheDocument()
  })

  it('shows a dismiss button only when onDismiss is provided, and calls it on click', () => {
    /**
     * Existing indexing/profile-gen cards auto-disappear when their store
     * state changes — no dismiss needed. New error notifications need an
     * × so users can clear them before TTL expires. This test pins the
     * boolean: button presence == onDismiss provided.
     */
    const onDismiss = vi.fn()
    render(<NotificationCard title="Error" description="boom" onDismiss={onDismiss} />)
    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i })
    fireEvent.click(closeBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('applies a coral left border for accent="error"', () => {
    /**
     * Visual-distinct accent so users can scan a stack of cards and spot
     * errors at a glance. Tested via the inline style attribute since the
     * component uses style props (not classes) — matches the existing
     * design-system pattern across the codebase.
     */
    render(<NotificationCard title="Error" accent="error" />)
    const card = screen.getByRole('status')
    expect(card.style.borderLeft).toContain('soft-coral')
  })

  it('applies a green left border for accent="success"', () => {
    render(<NotificationCard title="Done" accent="success" />)
    const card = screen.getByRole('status')
    expect(card.style.borderLeft).toContain('gentle-green')
  })

  it('keeps the neutral look (no accent border) by default for backwards compat with indexing/profile cards', () => {
    /**
     * The existing indexing + profile-gen cards previously had no left
     * accent — just a uniform stone border. After extracting them into
     * NotificationCard, neutral is the default and must render
     * identically. Test pins that assertion: no soft-coral / gentle-green
     * leak into the default rendering.
     */
    render(<NotificationCard title="Indexing..." />)
    const card = screen.getByRole('status')
    expect(card.style.borderLeft).not.toContain('soft-coral')
    expect(card.style.borderLeft).not.toContain('gentle-green')
  })
})
