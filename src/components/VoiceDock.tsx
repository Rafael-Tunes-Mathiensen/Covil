import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronUp, GripHorizontal, Headphones, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff } from 'lucide-react'
import type { UseVoiceRoomResult } from '../features/voice'

const MINIMIZED_KEY = 'covil:voice-dock-minimized'
const POSITION_KEY = 'covil:voice-dock-position'

interface DockPosition {
  x: number
  y: number
}

function readPosition(): DockPosition | null {
  try {
    const stored = localStorage.getItem(POSITION_KEY)
    if (!stored) return null
    const value = JSON.parse(stored) as Partial<DockPosition>
    return Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: Number(value.x), y: Number(value.y) }
      : null
  } catch {
    return null
  }
}

interface VoiceDockProps {
  roomName: string
  voice: UseVoiceRoomResult
  onToggleMute?: () => void
  onToggleShare?: () => void | Promise<void>
  onLeave?: () => void | Promise<void>
}

export function VoiceDock({ roomName, voice, onToggleMute, onToggleShare, onLeave }: VoiceDockProps) {
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem(MINIMIZED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [position, setPosition] = useState<DockPosition | null>(readPosition)
  const dockRef = useRef<HTMLDivElement>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const didDragRef = useRef(false)
  const hasPosition = position !== null

  useEffect(() => {
    try {
      localStorage.setItem(MINIMIZED_KEY, String(isMinimized))
    } catch {
      // A preferência continua funcional durante a sessão.
    }
  }, [isMinimized])

  useEffect(() => {
    try {
      if (position) localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    } catch {
      // A posição continua funcional durante a sessão.
    }
  }, [position])

  useEffect(() => () => dragCleanupRef.current?.(), [])

  useEffect(() => {
    if (!hasPosition) return
    const keepVisible = () => {
      const dock = dockRef.current
      if (!dock) return
      const parent = dock.offsetParent as HTMLElement | null
      const parentBounds = parent?.getBoundingClientRect()
      const dockBounds = dock.getBoundingClientRect()
      const width = parentBounds?.width || window.innerWidth
      const height = parentBounds?.height || window.innerHeight
      const maxX = Math.max(8, width - dockBounds.width - 8)
      const maxY = Math.max(8, height - dockBounds.height - 8)
      setPosition((current) => {
        if (!current) return current
        const next = {
          x: Math.min(maxX, Math.max(8, current.x)),
          y: Math.min(maxY, Math.max(8, current.y)),
        }
        return next.x === current.x && next.y === current.y ? current : next
      })
    }
    keepVisible()
    window.addEventListener('resize', keepVisible)
    return () => window.removeEventListener('resize', keepVisible)
  }, [hasPosition, isMinimized, voice.status])

  function startDragging(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !dockRef.current) return
    const dock = dockRef.current
    const parent = dock.offsetParent as HTMLElement | null
    const dockBounds = dock.getBoundingClientRect()
    const parentBounds = parent?.getBoundingClientRect()
    const parentLeft = parentBounds?.left ?? 0
    const parentTop = parentBounds?.top ?? 0
    const parentWidth = parentBounds?.width || window.innerWidth
    const parentHeight = parentBounds?.height || window.innerHeight
    const offsetX = event.clientX - dockBounds.left
    const offsetY = event.clientY - dockBounds.top
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    didDragRef.current = false

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
        didDragRef.current = true
      }
      const maxX = Math.max(8, parentWidth - dockBounds.width - 8)
      const maxY = Math.max(8, parentHeight - dockBounds.height - 8)
      setPosition({
        x: Math.min(maxX, Math.max(8, moveEvent.clientX - parentLeft - offsetX)),
        y: Math.min(maxY, Math.max(8, moveEvent.clientY - parentTop - offsetY)),
      })
    }
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragCleanupRef.current = null
    }

    dragCleanupRef.current?.()
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  function expandCompactDock() {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    setIsMinimized(false)
  }

  const dockStyle = position
    ? ({ bottom: 'auto', left: position.x, margin: 0, right: 'auto', top: position.y, transform: 'none' } satisfies CSSProperties)
    : undefined

  if (voice.status === 'idle') return null

  if (isMinimized) {
    return (
      <div
        aria-label="Chamada minimizada"
        className="voice-dock voice-dock--minimized voice-dock--compact"
        data-positioned={position ? 'true' : 'false'}
        ref={dockRef}
        style={dockStyle}
      >
        <button
          aria-label="Expandir controles da chamada"
          className="voice-dock__compact-button"
          onClick={expandCompactDock}
          onPointerDown={startDragging}
          title={`${roomName} · arraste para mover ou clique para expandir`}
          type="button"
        >
          <Headphones size={18} /><i /><ChevronUp size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      aria-label="Controles da chamada"
      className="voice-dock"
      data-positioned={position ? 'true' : 'false'}
      ref={dockRef}
      style={dockStyle}
    >
      <button
        aria-label="Mover controles da chamada"
        className="voice-dock__drag-handle"
        onPointerDown={startDragging}
        title="Segure e arraste para mover"
        type="button"
      >
        <GripHorizontal size={17} />
      </button>
      <div className="voice-dock__status">
        <span><Headphones size={16} /></span>
        <p><strong>{roomName}</strong><small>{voice.isServerMuted ? 'Silenciado pela moderação' : voice.status === 'joined' ? 'Voz conectada' : 'Conectando…'}</small></p>
      </div>
      <div className="voice-dock__controls">
        <button aria-label="Minimizar controles da chamada" onClick={() => setIsMinimized(true)} title="Minimizar" type="button">
          <ChevronDown size={19} />
        </button>
        <button
          aria-label={voice.isServerMuted ? 'Microfone silenciado pela moderação' : voice.isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
          aria-pressed={voice.isMuted}
          className={voice.isMuted ? 'is-off' : ''}
          disabled={voice.status !== 'joined' || voice.isServerMuted}
          onClick={onToggleMute ?? voice.toggleMute}
          title={voice.isServerMuted ? 'O moderador silenciou seu microfone' : voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
          type="button"
        >
          {voice.isMuted ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <button
          aria-label={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          aria-pressed={voice.isScreenSharing}
          className={voice.isScreenSharing ? 'is-active' : ''}
          disabled={voice.status !== 'joined'}
          onClick={() => void (onToggleShare ? onToggleShare() : (voice.isScreenSharing ? voice.stopScreenShare() : voice.startScreenShare()))}
          title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          type="button"
        >
          {voice.isScreenSharing ? <MonitorOff size={19} /> : <MonitorUp size={19} />}
        </button>
        <span className="voice-dock__divider" />
        <button
          aria-label="Sair da chamada"
          className="hangup-button"
          onClick={() => void (onLeave ? onLeave() : voice.leave())}
          title="Sair da chamada"
          type="button"
        >
          <PhoneOff size={19} />
        </button>
      </div>
    </div>
  )
}
