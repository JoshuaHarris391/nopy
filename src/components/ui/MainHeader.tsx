interface MainHeaderProps {
  title: string
  children?: React.ReactNode
}

export function MainHeader({ title, children }: MainHeaderProps) {
  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        padding: '0 44px',
        height: 64,
        borderBottom: '1px solid var(--stone)',
        background: 'var(--parchment)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>
      {children && <div className="flex items-center gap-2.5">{children}</div>}
    </div>
  )
}
