import { Headphones, LoaderCircle, MonitorUp, Radio, UsersRound } from 'lucide-react'
import type { Profile } from '../types/domain'
import type { UseVoiceRoomResult } from '../features/voice'
import { Avatar } from './Avatar'
import { StreamVideo } from './StreamVideo'

interface VoiceRoomPanelProps {
  roomName: string
  currentUser: Profile
  voice: UseVoiceRoomResult
  isDemo: boolean
  onToggleMembers: () => void
}

export function VoiceRoomPanel({
  roomName,
  currentUser,
  voice,
  isDemo,
  onToggleMembers,
}: VoiceRoomPanelProps) {
  const remoteShare = voice.remotePeers.find(({ screenStream }) => screenStream)
  const screenStream = remoteShare?.screenStream ?? voice.localScreenStream
  const sharer = remoteShare?.participant.displayName ?? currentUser.displayName
  const isTransitioning = voice.status === 'joining' || voice.status === 'leaving'

  return (
    <section className="workspace-panel voice-panel">
      <header className="workspace-header">
        <div className="workspace-header__title"><VolumeGlyph /><strong>{roomName}</strong></div>
        <div className="workspace-header__meta">
          {voice.status === 'joined' && <span className="connected-label"><i /> CONECTADO</span>}
          {isDemo && <span className="demo-badge">MÍDIA LOCAL</span>}
          <button aria-label="Mostrar participantes" onClick={onToggleMembers} type="button">
            <UsersRound size={19} />
          </button>
        </div>
      </header>

      {screenStream ? (
        <div className="screen-stage">
          <div className="screen-stage__meta">
            <MonitorUp size={16} /><span>{sharer} está compartilhando</span>
          </div>
          <StreamVideo
            label={`Tela compartilhada por ${sharer}`}
            muted={!remoteShare}
            stream={screenStream}
          />
        </div>
      ) : voice.status === 'idle' ? (
        <div className="voice-empty">
          <div className="voice-orbit" aria-hidden="true">
            <span className="voice-orbit__center"><Headphones size={38} /></span>
            <i /><i /><i />
          </div>
          <p className="eyebrow">SALA DE VOZ</p>
          <h1>O Lobby está esperando.</h1>
          <p>Entre com o microfone e chame o resto da equipe.</p>
          <button className="primary-button primary-button--compact" onClick={() => void voice.join()} type="button">
            <Headphones size={18} /><span>Entrar na voz</span>
          </button>
        </div>
      ) : isTransitioning ? (
        <div className="voice-empty"><LoaderCircle className="spin" size={32} /><p>Conectando à sala…</p></div>
      ) : (
        <div className="voice-grid">
          <header><Radio size={17} /><span>{voice.participants.length} na sala agora</span></header>
          <div className="voice-grid__people">
            {voice.participants.map((participant, index) => {
              const profile = participant.id === currentUser.id ? currentUser : undefined
              return (
                <div className="voice-person" key={participant.id}>
                  <Avatar
                    color={profile?.avatarColor ?? ['#7a8cff', '#55c98a', '#d58cff'][index % 3]}
                    name={participant.displayName}
                    size="large"
                    speaking={index === 1}
                  />
                  <strong>{participant.displayName}</strong>
                  <span>{participant.id === currentUser.id ? 'você' : 'na voz'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {voice.error && (
        <button
          className="voice-error voice-error--room"
          onClick={() => {
            if (voice.error?.code === 'audio-playback-blocked') {
              void voice.resumeRemoteAudio()
            } else {
              voice.clearError()
            }
          }}
          type="button"
        >
          {voice.error.message}
        </button>
      )}
    </section>
  )
}

function VolumeGlyph() {
  return <Radio size={19} />
}
