interface SettingsRowProps {
  label: string
  description?: string
  descriptionFont?: 'ui' | 'mono'
  children: React.ReactNode
}

export function SettingsRow({ label, description, descriptionFont = 'ui', children }: SettingsRowProps) {
  return (
    <div className="flex justify-between items-center" style={{ padding: '10px 0' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--manuscript)' }}>{label}</div>
        {description && (
          <div style={{
            fontFamily: descriptionFont === 'mono' ? 'var(--font-mono)' : 'var(--font-ui)',
            fontSize: descriptionFont === 'mono' ? 11 : 12,
            color: 'var(--sage)',
            marginTop: 2,
          }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
