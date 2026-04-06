import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div style={{ color: 'var(--stone)', marginBottom: 16 }}>{icon}</div>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--ink)',
          marginBottom: 8,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 14,
          color: 'var(--sage)',
          maxWidth: 320,
          marginBottom: action ? 20 : 0,
        }}
      >
        {description}
      </p>
      {action}
    </div>
  )
}
