import { useEffect, useRef, useState } from 'react'

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  size: number
  color: string
  phase: number
}

const COLORS = ['#5B7F5E', '#8B7355', '#C49A6C', '#7A9E7E', '#A67C52']
const GRAVITY = 0.012
const WIND_STRENGTH = 0.6
const RIM_WIDTH = 60
const BOTTOM_WIDTH = 36
const BASKET_HEIGHT = 30
const BASKET_DAMPING = 0.2
const BASKET_SPRING = 0.5

export function LeafCatcherGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    leaves: [] as Leaf[],
    // Rim (top opening) — follows cursor directly
    rimX: 0,
    rimY: 0,
    // Bottom of basket — trails with momentum
    bottomX: 0,
    bottomY: 0,
    bottomVx: 0,
    bottomVy: 0,
    // Target from cursor
    targetX: 0,
    targetY: 0,
    score: 0,
    frame: 0,
  })
  const [score, setScore] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const s = stateRef.current
      s.rimX = cx; s.rimY = cy
      s.bottomX = cx; s.bottomY = cy + BASKET_HEIGHT
      s.targetX = cx; s.targetY = cy
    }
    resize()
    window.addEventListener('resize', resize)

    const handleMove = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      stateRef.current.targetX = clientX - rect.left
      stateRef.current.targetY = clientY - rect.top
    }
    const onMouse = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    canvas.addEventListener('mousemove', onMouse)
    canvas.addEventListener('touchmove', onTouch, { passive: true })

    const ctx = canvas.getContext('2d')!
    let raf: number

    const spawnLeaf = () => {
      const s = stateRef.current
      s.leaves.push({
        x: Math.random() * canvas.width,
        y: -20,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.15 + Math.random() * 0.25,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.03,
        size: 8 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
      })
    }

    const drawLeaf = (leaf: Leaf) => {
      ctx.save()
      ctx.translate(leaf.x, leaf.y)
      ctx.rotate(leaf.rotation)
      ctx.fillStyle = leaf.color
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      const sz = leaf.size
      ctx.moveTo(0, -sz)
      ctx.bezierCurveTo(sz * 0.6, -sz * 0.6, sz * 0.8, sz * 0.2, 0, sz)
      ctx.bezierCurveTo(-sz * 0.8, sz * 0.2, -sz * 0.6, -sz * 0.6, 0, -sz)
      ctx.fill()
      ctx.strokeStyle = leaf.color
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(0, -sz * 0.6)
      ctx.lineTo(0, sz * 0.8)
      ctx.stroke()
      ctx.restore()
    }

    const drawBasket = () => {
      const s = stateRef.current
      const rx = s.rimX
      const ry = s.rimY
      const bx = s.bottomX
      const by = s.bottomY

      ctx.globalAlpha = 0.7

      // Left side
      ctx.strokeStyle = '#8B7355'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(rx - RIM_WIDTH / 2, ry)
      ctx.quadraticCurveTo(
        (rx - RIM_WIDTH / 2 + bx - BOTTOM_WIDTH / 2) / 2 - 4, (ry + by) / 2,
        bx - BOTTOM_WIDTH / 2, by,
      )
      ctx.stroke()

      // Right side
      ctx.beginPath()
      ctx.moveTo(rx + RIM_WIDTH / 2, ry)
      ctx.quadraticCurveTo(
        (rx + RIM_WIDTH / 2 + bx + BOTTOM_WIDTH / 2) / 2 + 4, (ry + by) / 2,
        bx + BOTTOM_WIDTH / 2, by,
      )
      ctx.stroke()

      // Bottom arc
      ctx.beginPath()
      ctx.ellipse(bx, by, BOTTOM_WIDTH / 2, 4, 0, 0, Math.PI)
      ctx.stroke()

      // Rim (top opening) — thicker
      ctx.strokeStyle = '#6B5335'
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.ellipse(rx, ry, RIM_WIDTH / 2, 6, 0, 0, Math.PI * 2)
      ctx.stroke()

      // Horizontal weave lines
      ctx.strokeStyle = '#A08060'
      ctx.lineWidth = 0.8
      ctx.globalAlpha = 0.3
      const rows = 5
      for (let i = 1; i <= rows; i++) {
        const t = i / (rows + 1)
        const wy = ry + (by - ry) * t
        const wHalfW = (RIM_WIDTH / 2) * (1 - t) + (BOTTOM_WIDTH / 2) * t
        const wcx = rx * (1 - t) + bx * t
        ctx.beginPath()
        ctx.ellipse(wcx, wy, wHalfW, 3 * (1 - t * 0.5), 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Diagonal crisscross lines
      ctx.lineWidth = 0.7
      ctx.globalAlpha = 0.25
      const strands = 7
      for (let i = 0; i < strands; i++) {
        const rimT = i / (strands - 1) // 0..1 across rim
        const rimPx = rx - RIM_WIDTH / 2 + RIM_WIDTH * rimT
        // Cross to opposite side at bottom
        const crossT = 1 - rimT
        const botPx = bx - BOTTOM_WIDTH / 2 + BOTTOM_WIDTH * crossT
        const midX = (rimPx + botPx) / 2 + (bx - rx) * 0.5
        const midY = (ry + by) / 2
        ctx.beginPath()
        ctx.moveTo(rimPx, ry + 6)
        ctx.quadraticCurveTo(midX, midY, botPx, by - 3)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
    }

    const tick = () => {
      const s = stateRef.current
      s.frame++

      // Spawn leaves
      if (s.frame % 60 === 0) spawnLeaf()

      // Rim follows cursor directly
      s.rimX = s.targetX
      s.rimY = s.targetY

      // Bottom trails with spring/momentum physics
      const dx = s.rimX - s.bottomX
      const dy = (s.rimY + BASKET_HEIGHT) - s.bottomY
      s.bottomVx += dx * BASKET_SPRING
      s.bottomVy += dy * BASKET_SPRING
      s.bottomVx *= BASKET_DAMPING
      s.bottomVy *= BASKET_DAMPING
      s.bottomX += s.bottomVx
      s.bottomY += s.bottomVy

      // Update leaves
      s.leaves = s.leaves.filter((leaf) => {
        leaf.vy += GRAVITY
        leaf.vx += Math.sin(s.frame * 0.015 + leaf.phase) * WIND_STRENGTH * 0.008
        leaf.x += leaf.vx
        leaf.y += leaf.vy
        leaf.rotation += leaf.rotationSpeed

        // Check catch — leaf enters the rim opening
        const distToRim = Math.sqrt((leaf.x - s.rimX) ** 2 + (leaf.y - s.rimY) ** 2)
        if (distToRim < RIM_WIDTH / 2 && leaf.y >= s.rimY - 4 && leaf.y <= s.rimY + 12) {
          s.score++
          setScore(s.score)
          return false
        }

        return leaf.y < canvas.height + 30
      })

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Tree canopy at top
      ctx.fillStyle = '#5B7F5E'
      ctx.globalAlpha = 0.12
      for (let i = 0; i < 5; i++) {
        const cx = canvas.width * (0.15 + i * 0.175)
        const cy = -10
        ctx.beginPath()
        ctx.ellipse(cx, cy, 60 + i * 10, 40, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      s.leaves.forEach(drawLeaf)
      drawBasket()

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouse)
      canvas.removeEventListener('touchmove', onTouch)
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col items-center justify-center" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'none' }}
      />
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--sage)', opacity: 0.7 }}>
        {score > 0 ? `${score} leaves caught` : 'Move to catch falling leaves'}
      </div>
    </div>
  )
}
