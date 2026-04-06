import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}

export function Button({ variant = 'primary', children, style, ...props }: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    fontWeight: 500,
    padding: '7px 16px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-gentle)',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    userSelect: 'none',
    ...style,
  }

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          background: 'var(--forest)',
          color: 'white',
          boxShadow: '0 2px 6px rgba(91, 127, 94, 0.22)',
        }
      : {
          background: 'transparent',
          color: 'var(--ink)',
          border: '1px solid var(--stone)',
        }

  return (
    <button style={{ ...baseStyle, ...variantStyle }} {...props}>
      {children}
    </button>
  )
}
