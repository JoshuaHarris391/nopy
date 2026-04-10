interface SettingsSectionProps {
  title: string
  children: React.ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--stone)' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 14 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}
