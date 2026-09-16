import { NavLink } from 'react-router-dom'
import { BookOpen, MessageCircle, Layers, Target, List, Settings } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

/** Items that stay while private mode hides the AI half of the app. */
const PRIVATE_ITEMS = new Set(['/journal', '/settings'])

const items = [
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/context', icon: Layers, label: 'Context' },
  { to: '/profile', icon: Target, label: 'Profile' },
  { to: '/index', icon: List, label: 'Index' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const privateMode = useSettingsStore((s) => s.privateMode)
  const visible = privateMode ? items.filter((item) => PRIVATE_ITEMS.has(item.to)) : items

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around border-t z-20"
      style={{
        height: 56,
        background: 'var(--warm-cream)',
        borderColor: 'var(--stone)',
      }}
    >
      {visible.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className="flex flex-col items-center gap-1 no-underline"
            style={({ isActive }) => ({
              color: isActive ? 'var(--ink)' : 'var(--sage)',
              fontFamily: 'var(--font-ui)',
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
