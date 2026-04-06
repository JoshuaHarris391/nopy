import { NavLink } from 'react-router-dom'
import { BookOpen, MessageCircle, Target, List, Settings, Flower, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

const navItems = [
  { to: '/', icon: BookOpen, label: 'Journal', section: 'Reflect' },
  { to: '/chat', icon: MessageCircle, label: 'Chat', section: 'Understand' },
  { to: '/profile', icon: Target, label: 'Profile', section: 'Understand' },
  { to: '/index', icon: List, label: 'Index', section: 'Understand' },
  { to: '/settings', icon: Settings, label: 'Settings', section: 'Configure' },
]

export function Sidebar() {
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)
  const apiKey = useSettingsStore((s) => s.apiKey)

  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 border-r z-10"
      style={{
        width: collapsed ? 64 : 'var(--sidebar-width)',
        minWidth: collapsed ? 64 : 'var(--sidebar-width)',
        background: 'var(--warm-cream)',
        borderColor: 'var(--stone)',
        transition: 'width var(--transition-gentle), min-width var(--transition-gentle)',
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center gap-3 border-b flex-shrink-0"
        style={{ padding: collapsed ? '0 16px' : '0 22px', height: 64, borderColor: 'var(--stone)' }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            background: 'linear-gradient(145deg, var(--forest), var(--gentle-green))',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(139, 115, 85, 0.3)',
          }}
        >
          <Flower size={18} color="white" strokeWidth={1.8} />
        </div>
        {!collapsed && (
          <h1
            className="leading-tight"
            style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.015em' }}
          >
            nopy
          </h1>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-px overflow-y-auto" style={{ padding: '14px 10px' }}>
        {renderNavSections(collapsed)}
      </nav>

      {/* Footer */}
      <div className="border-t flex items-center justify-between" style={{ padding: collapsed ? '14px 16px' : '14px 18px', borderColor: 'var(--stone)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--sage)' }}>
            <div
              style={{
                width: 10, height: 10, borderRadius: '50%',
                background: apiKey ? 'var(--gentle-green)' : 'var(--soft-coral)',
                boxShadow: apiKey ? '0 0 5px rgba(123, 175, 123, 0.45)' : '0 0 5px rgba(196, 131, 106, 0.45)',
              }}
            />
            <span>{apiKey ? 'Connected' : 'No API key'}</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: 'none', color: 'var(--sage)',
            transition: 'all var(--transition-gentle)',
            margin: collapsed ? '0 auto' : undefined,
          }}
        >
          {collapsed ? <ChevronsRight size={16} strokeWidth={1.8} /> : <ChevronsLeft size={16} strokeWidth={1.8} />}
        </button>
      </div>
    </aside>
  )
}

function renderNavSections(collapsed: boolean) {
  let currentSection = ''
  const elements: React.ReactNode[] = []

  navItems.forEach((item) => {
    if (item.section !== currentSection) {
      currentSection = item.section
      if (!collapsed) {
        elements.push(
          <div
            key={`section-${item.section}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--amber)',
              padding: '20px 14px 6px',
              fontWeight: 700,
            }}
          >
            {item.section}
          </div>
        )
      }
    }

    const Icon = item.icon
    elements.push(
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={() =>
          `flex items-center gap-3 cursor-pointer select-none no-underline ${collapsed ? 'justify-center' : ''}`
        }
        style={({ isActive }) => ({
          padding: collapsed ? '9px 0' : '9px 14px',
          borderRadius: 'var(--radius-sm)',
          borderLeft: `3px solid ${isActive ? 'var(--amber)' : 'transparent'}`,
          background: isActive ? 'var(--parchment)' : 'transparent',
          fontFamily: 'var(--font-ui)',
          fontSize: 13.5,
          color: isActive ? 'var(--ink)' : 'var(--manuscript)',
          fontWeight: isActive ? 500 : 400,
          transition: 'all var(--transition-gentle)',
        })}
      >
        <Icon
          size={17}
          strokeWidth={1.8}
          style={{ flexShrink: 0, color: 'var(--sage)' }}
        />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    )
  })

  return elements
}
