interface ContextBudgetBarProps {
  baseTokens: number
  injectedTokens: number
  window: number
  windowSource: 'detected' | 'default' | 'manual'
  outputReserve: number
}

const SOURCE_LABEL: Record<ContextBudgetBarProps['windowSource'], string> = {
  detected: 'detected',
  default: 'estimated',
  manual: 'manual',
}

function conversationReserve(window: number): number {
  return Math.min(Math.max(Math.round(0.2 * window), 2_000), 50_000)
}

/**
 * The segmented indicator bar. Shows how the fixed base prompt + the injected
 * context consume the model's context window, with a threshold marker for the
 * headroom reserved for the live conversation + the model's reply.
 */
export function ContextBudgetBar({ baseTokens, injectedTokens, window, windowSource, outputReserve }: ContextBudgetBarProps) {
  const used = baseTokens + injectedTokens
  const threshold = Math.max(window - outputReserve - conversationReserve(window), 0)

  const overWindow = used > window
  const overThreshold = used > threshold
  const accent = overWindow ? 'var(--soft-coral)' : overThreshold ? 'var(--amber)' : 'var(--forest)'

  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / window) * 100))}%`

  const status = overWindow
    ? "Over the model's window — the chat will fail. Remove cards or raise the window."
    : overThreshold
      ? 'Getting full — the live conversation will start dropping older messages sooner.'
      : 'Plenty of room for the conversation.'

  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div className="flex items-center justify-between" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)' }}>
        <span>
          Context window · <span style={{ color: 'var(--manuscript)' }}>{window.toLocaleString()}</span> tokens
          <span style={{ opacity: 0.7 }}> ({SOURCE_LABEL[windowSource]})</span>
        </span>
        <span style={{ color: accent, fontWeight: 500 }}>{used.toLocaleString()} used</span>
      </div>

      {/* Track */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: 10, background: 'var(--warm-cream)', borderRadius: 5, border: '1px solid rgba(212, 201, 184, 0.5)' }}
      >
        {/* base segment */}
        <div className="absolute top-0 bottom-0 left-0" style={{ width: pct(baseTokens), background: 'var(--sage)', opacity: 0.5 }} />
        {/* injected segment */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: pct(baseTokens), width: pct(injectedTokens), background: accent, transition: 'width 200ms ease-out, background 200ms ease-out' }}
        />
        {/* threshold marker */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: pct(threshold), width: 2, background: 'var(--bark)', opacity: 0.6 }}
          title="Conversation headroom starts here"
        />
      </div>

      <div className="flex items-center justify-between" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: overThreshold ? accent : 'var(--sage)' }}>
        <span>{status}</span>
        <span style={{ opacity: 0.7 }}>base {baseTokens.toLocaleString()} · context {injectedTokens.toLocaleString()}</span>
      </div>
    </div>
  )
}
