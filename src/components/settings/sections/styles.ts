/**
 * Shared form-control styles for the Settings views. Previously copy-pasted
 * into each section/block — keep additions here so a style tweak lands
 * everywhere at once. Call sites spread and override (e.g. minWidth) as
 * needed.
 */
export const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, padding: '6px 12px',
  border: '1px solid var(--stone)', borderRadius: 'var(--radius-sm)',
  background: 'var(--warm-cream)', color: 'var(--ink)',
  outline: 'none', cursor: 'pointer',
}
