import { Headphones, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff } from 'lucide-react'
import type { UseVoiceRoomResult } from '../features/voice'

interface VoiceDockProps {
  roomName: string
  voice: UseVoiceRoomResult
}

export function VoiceDock({ roomName, voice }: VoiceDockProps) {
  if (voice.status === 'idle') return null

  return (
    <div className="voice-dock" aria-label="Controles da chamada">
      <div className="voice-dock__status">
        <span><Headphones size={16} /></span>
        <p><strong>{roomName}</strong><small>{voice.status === 'joined' ? 'Voz conectada' : 'Conectando…'}</small></p>
      </div>
      <div className="voice-dock__controls">
        <button
          aria-label={voice.isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
          className={voice.isMuted ? 'is-off' : ''}
          disabled={voice.status !== 'joined'}
          onClick={voice.toggleMute}
          title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
          type="button"
        >
          {voice.isMuted ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        <button
          aria-label={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          className={voice.isScreenSharing ? 'is-active' : ''}
          disabled={voice.status !== 'joined'}
          onClick={() => void (voice.isScreenSharing ? voice.stopScreenShare() : voice.startScreenShare())}
          title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          type="button"
        >
          {voice.isScreenSharing ? <MonitorOff size={19} /> : <MonitorUp size={19} />}
        </button>
        <span className="voice-dock__divider" />
        <button
          aria-label="Sair da chamada"
          className="hangup-button"
          onClick={() => void voice.leave()}
          title="Sair da chamada"
          type="button"
        >
          <PhoneOff size={19} />
        </button>
      </div>
    </div>
  )
}
