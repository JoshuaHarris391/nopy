import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { BookOpen, MessageCircle, Target, List, Settings, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import nopyLogo from '../../assets/nopy_logo.png'

const navItems = [
  { to: '/', icon: BookOpen, label: 'Journal', section: 'Reflect' },
  { to: '/chat', icon: MessageCircle, label: 'Chat', section: 'Understand' },
  { to: '/profile', icon: Target, label: 'Profile', section: 'Understand' },
  { to: '/index', icon: List, label: 'Index', section: 'Understand' },
]

const sections = ['Reflect', 'Understand']

export function Sidebar() {
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const theme = useSettingsStore((s) => s.theme)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Auto-collapse below 1024px
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    if (mq.matches) setSidebarCollapsed(true)
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarCollapsed(true)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setSidebarCollapsed])

  const transition = reducedMotion ? 'none' : 'width 300ms ease-in-out, min-width 300ms ease-in-out'

  return (
    <aside
      className="hidden md:flex flex-col flex-shrink-0 border-r z-10"
      style={{
        width: collapsed ? 64 : 'var(--sidebar-width)',
        minWidth: collapsed ? 64 : 'var(--sidebar-width)',
        background: 'var(--warm-cream)',
        borderColor: 'var(--stone)',
        transition,
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center flex-shrink-0 border-b"
        style={{
          padding: collapsed ? '0 16px' : '0 16px',
          height: 64,
          borderColor: 'var(--stone)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? (
          <img
            src={nopyLogo}
            alt="nopy"
            style={{
              width: 28,
              height: 28,
              objectFit: 'contain',
              filter: theme === 'dark' ? 'invert(1)' : 'none',
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={nopyLogo}
              alt="nopy"
              style={{
                width: 28,
                height: 28,
                objectFit: 'contain',
                filter: theme === 'dark' ? 'invert(1)' : 'none',
              }}
            />
            <h1
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                margin: 0,
              }}
            >
              nopy
            </h1>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '8px 0' }}>
        {sections.map((section, sectionIndex) => {
          const items = navItems.filter((item) => item.section === section)
          if (items.length === 0) return null
          return (
            <div key={section}>
              {/* Section divider (not first) */}
              {sectionIndex > 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--stone)',
                    margin: '16px 16px',
                  }}
                />
              )}

              {/* Section label */}
              {!collapsed && (
                <div
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--sage)',
                    padding: '0 16px 8px',
                  }}
                >
                  {section}
                </div>
              )}

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: collapsed ? '0 8px' : '0 8px' }}>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavItem
                      key={item.to}
                      to={item.to}
                      icon={Icon}
                      label={item.label}
                      collapsed={collapsed}
                      reducedMotion={reducedMotion}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div
        className="border-t flex"
        style={{
          padding: '16px',
          borderColor: 'var(--stone)',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? 6 : 0,
        }}
      >
        {collapsed ? (
          <>
            <SettingsCogButton reducedMotion={reducedMotion} />
            <button
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className="flex items-center justify-center cursor-pointer"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                border: 'none',
                color: 'rgb(44 62 44 / 0.55)',
                transition: reducedMotion ? 'none' : 'color 200ms ease-out',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--forest)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(44 62 44 / 0.55)')}
            >
              <ChevronsRight size={16} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center" style={{ gap: 10 }}>
              <SettingsCogButton reducedMotion={reducedMotion} />
              <div
                aria-hidden
                style={{
                  width: 1,
                  height: 14,
                  background: 'var(--stone)',
                  flexShrink: 0,
                }}
              />
              <div
                className="flex items-center"
                style={{
                  gap: 6,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  color: 'var(--sage)',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: apiKey ? 'var(--gentle-green)' : 'var(--soft-coral)',
                  }}
                />
                <span>{apiKey ? 'Connected' : 'No API key'}</span>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="flex items-center justify-center cursor-pointer"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                border: 'none',
                color: 'rgb(44 62 44 / 0.55)',
                transition: reducedMotion ? 'none' : 'color 200ms ease-out',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--forest)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(44 62 44 / 0.55)')}
            >
              <ChevronsLeft size={16} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  reducedMotion,
}: {
  to: string
  icon: React.ElementType
  label: string
  collapsed: boolean
  reducedMotion: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const hoverTransition = reducedMotion ? 'none' : 'background 200ms ease-out, color 200ms ease-out'

  return (
    <NavLink
      to={to}
      end={to === '/'}
      className="flex items-center no-underline select-none cursor-pointer"
      style={({ isActive }) => ({
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: '8px 16px',
        borderRadius: 'var(--radius-sm)',
        borderLeft: `3px solid ${isActive ? 'var(--forest)' : 'transparent'}`,
        background: isActive || hovered ? 'var(--parchment)' : 'transparent',
        fontFamily: 'var(--font-ui)',
        fontSize: 14,
        color: isActive ? 'var(--ink)' : 'var(--manuscript)',
        fontWeight: isActive ? 500 : 400,
        transition: hoverTransition,
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={20}
            strokeWidth={1.5}
            style={{
              flexShrink: 0,
              color: isActive || hovered ? 'var(--forest)' : 'var(--sage)',
              transition: reducedMotion ? 'none' : 'color 200ms ease-out',
            }}
          />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function SettingsCogButton({ reducedMotion }: { reducedMotion: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <NavLink
      to="/settings"
      aria-label="Settings"
      className="flex items-center justify-center no-underline cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: isActive || hovered ? 'var(--forest)' : 'rgb(44 62 44 / 0.55)',
        transition: reducedMotion ? 'none' : 'color 200ms ease-out',
      })}
    >
      <Settings size={16} strokeWidth={1.5} />
    </NavLink>
  )
}
