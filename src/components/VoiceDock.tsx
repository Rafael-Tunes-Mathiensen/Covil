import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Headphones, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff } from 'lucide-react'
import type { UseVoiceRoomResult } from '../features/voice'

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
      return localStorage.getItem('covil:voice-dock-minimized') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('covil:voice-dock-minimized', String(isMinimized))
    } catch {
      // A preferência continua funcional durante a sessão.
    }
  }, [isMinimized])

  if (voice.status === 'idle') return null

  if (isMinimized) {
    return (
      <div className="voice-dock voice-dock--minimized" aria-label="Chamada minimizada">
        <span><Headphones size={15} /><strong>{roomName}</strong><i /></span>
        <button aria-label="Expandir controles da chamada" onClick={() => setIsMinimized(false)} title="Expandir chamada" type="button">
          <ChevronUp size={18} />
        </button>
        <button aria-label="Sair da chamada" className="hangup-button" onClick={() => void (onLeave ? onLeave() : voice.leave())} title="Sair da chamada" type="button">
          <PhoneOff size={17} />
        </button>
      </div>
    )
  }

  return (
    <div className="voice-dock" aria-label="Controles da chamada">
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
