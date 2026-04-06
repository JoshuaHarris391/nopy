import { Leaf } from 'lucide-react'

export function AgentAvatar() {
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'linear-gradient(135deg, var(--bark), var(--amber))',
        boxShadow: '0 2px 6px rgba(139, 115, 85, 0.25)',
        marginTop: 2,
      }}
    >
      <Leaf size={15} color="white" strokeWidth={2} />
    </div>
  )
}
