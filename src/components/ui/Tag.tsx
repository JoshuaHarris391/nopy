interface TagProps {
  children: string
}

export function Tag({ children }: TagProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        padding: '2px 8px',
        background: 'var(--warm-cream)',
        border: '1px solid rgba(212, 201, 184, 0.7)',
        borderRadius: 20,
        color: 'var(--bark)',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  )
}
