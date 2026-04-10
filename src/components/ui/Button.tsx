import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'primary', children, style, ref, ...props }: ButtonProps) {
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

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--forest)',
      color: 'white',
      boxShadow: '0 2px 6px rgba(91, 127, 94, 0.22)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--stone)',
    },
    danger: {
      background: 'var(--soft-coral)',
      color: 'white',
    },
  }
  const variantStyle = variantStyles[variant]

  return (
    <button ref={ref} style={{ ...baseStyle, ...variantStyle }} {...props}>
      {children}
    </button>
  )
}
