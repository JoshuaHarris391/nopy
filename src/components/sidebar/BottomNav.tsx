import { NavLink } from 'react-router-dom'
import { BookOpen, MessageCircle, Target, List, Settings } from 'lucide-react'

const items = [
  { to: '/', icon: BookOpen, label: 'Journal' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/profile', icon: Target, label: 'Profile' },
  { to: '/index', icon: List, label: 'Index' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around border-t z-20"
      style={{
        height: 56,
        background: 'var(--warm-cream)',
        borderColor: 'var(--stone)',
      }}
    >
      {items.map((item) => {
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
