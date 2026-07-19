import { useState } from 'react'
import {
  Activity,
  Database,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  X,
} from 'lucide-react'
import type { UseVoiceRoomResult } from '../voice'
import type { AdminConsoleState } from './useAdminConsole'

type AdminTab = 'overview' | 'access' | 'connection'

const FREE_DATABASE_REFERENCE_BYTES = 500 * 1024 * 1024

interface AdminConsoleProps {
  admin: AdminConsoleState
  voice: UseVoiceRoomResult
  onClose: () => void
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / (1024 ** unit)).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatBitrate(bitsPerSecond: number) {
  if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} b/s`
  if (bitsPerSecond < 1_000_000) return `${(bitsPerSecond / 1000).toFixed(1)} kb/s`
  return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mb/s`
}

function formatDate(value: string | null) {
  if (!value) return 'Nunca'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function connectionLabel(state: RTCPeerConnectionState | RTCIceConnectionState) {
  const labels: Record<string, string> = {
    new: 'Preparando',
    checking: 'Verificando',
    connecting: 'Conectando',
    connected: 'Conectada',
    completed: 'Concluída',
    disconnected: 'Instável',
    failed: 'Falhou',
    closed: 'Encerrada',
  }
  return labels[state] ?? state
}

export function AdminConsole({ admin, voice, onClose }: AdminConsoleProps) {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const overview = admin.overview
  const canShareScreen = Boolean(
    navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices,
  )
  const databaseUsage = overview
    ? Math.min((overview.databaseSizeBytes / FREE_DATABASE_REFERENCE_BYTES) * 100, 100)
    : 0

  async function removeMember(covilId: string, userId: string) {
    const key = `${covilId}:${userId}`
    if (pendingRemoval !== key) {
      setPendingRemoval(key)
      return
    }

    setRemoving(key)
    setActionError(null)
    try {
      await admin.removeMember(covilId, userId)
      setPendingRemoval(null)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível remover o acesso.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="admin-backdrop" role="presentation">
      <section aria-label="Console do proprietário" aria-modal="true" className="admin-console" role="dialog">
        <header className="admin-console__header">
          <div>
            <span className="admin-console__crest"><ShieldCheck size={20} /></span>
            <p><small>CONSOLE DO PROPRIETÁRIO</small><strong>Controle do Covil</strong></p>
          </div>
          <div className="admin-console__header-actions">
            <button aria-label="Atualizar dados" disabled={admin.isLoading} onClick={() => void admin.refresh()} type="button">
              <RefreshCw className={admin.isLoading ? 'spin' : ''} size={17} />
            </button>
            <button aria-label="Fechar console" onClick={onClose} type="button"><X size={19} /></button>
          </div>
        </header>

        <nav aria-label="Secoes administrativas" className="admin-tabs">
          <button className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')} type="button"><Gauge size={16} /> Visão geral</button>
          <button className={tab === 'access' ? 'is-active' : ''} onClick={() => setTab('access')} type="button"><Users size={16} /> Acessos</button>
          <button className={tab === 'connection' ? 'is-active' : ''} onClick={() => setTab('connection')} type="button"><Activity size={16} /> Conexão</button>
        </nav>

        <div className="admin-console__body">
          {(admin.error || actionError) && <p className="admin-alert">{actionError ?? admin.error}</p>}
          {tab === 'overview' && (
            <div className="admin-overview">
              <section className="admin-hero-metric">
                <div><small>CAPACIDADE DO GRUPO</small><strong>{overview?.memberLimit ?? 6}</strong><span>membros por Covil</span></div>
                <p>O limite é validado no servidor, inclusive quando convites são usados ao mesmo tempo.</p>
              </section>
              <div className="admin-stat-line">
                <Metric label="Contas cadastradas" value={overview?.registeredUsers ?? 0} />
                <Metric label="Covils criados" value={overview?.covilsCount ?? 0} />
                <Metric label="Acessos ativos" value={overview?.activeMemberships ?? 0} />
                <Metric label="Mensagens salvas" value={overview?.messagesCount ?? 0} />
              </div>
              <section className="admin-storage">
                <header><span><Database size={17} /> Banco de dados</span><strong>{formatBytes(overview?.databaseSizeBytes ?? 0)}</strong></header>
                <div className="admin-progress"><i style={{ width: `${Math.max(databaseUsage, 0.5)}%` }} /></div>
                <p>
                  {databaseUsage.toFixed(2)}% da referência de 500 MB do plano gratuito. Mensagens e índices ocupam {formatBytes(overview?.messagesSizeBytes ?? 0)}.
                </p>
              </section>
              <footer className="admin-freshness">Última leitura do servidor: {formatDate(overview?.generatedAt ?? null)}</footer>
            </div>
          )}

          {tab === 'access' && (
            <div className="admin-access">
              <header><div><small>IDENTIDADES E GRUPOS</small><h2>Quem pode entrar</h2></div><span>{admin.accessRows.length} registros</span></header>
              <div className="admin-access-list">
                {admin.accessRows.map((row) => {
                  const removalKey = row.covilId ? `${row.covilId}:${row.userId}` : ''
                  const canRemove = row.membershipRole === 'member' && !row.isAppAdmin && row.covilId
                  return (
                    <article className="admin-access-row" key={`${row.userId}:${row.covilId ?? 'none'}`}>
                      <div className="admin-access-row__identity">
                        <strong>{row.displayName}</strong>
                        <span>{row.email}</span>
                      </div>
                      <div><small>COVIL</small><span>{row.covilName ?? 'Sem grupo'}</span></div>
                      <div><small>PERMISSÃO</small><span>{row.isAppAdmin ? 'Proprietário do app' : row.membershipRole === 'owner' ? 'Fundador' : row.membershipRole === 'member' ? 'Membro' : 'Sem acesso'}</span></div>
                      <div><small>ULTIMO LOGIN</small><span>{formatDate(row.lastSignInAt)}</span></div>
                      {canRemove ? (
                        <button
                          className={pendingRemoval === removalKey ? 'is-confirming' : ''}
                          disabled={removing === removalKey}
                          onClick={() => void removeMember(row.covilId!, row.userId)}
                          type="button"
                        >
                          <Trash2 size={14} /> {pendingRemoval === removalKey ? 'Confirmar' : 'Remover'}
                        </button>
                      ) : <span className="admin-access-row__locked">Protegido</span>}
                    </article>
                  )
                })}
              </div>
              <p className="admin-privacy-note"><ShieldCheck size={15} /> Este painel exibe contas e acessos. O conteúdo das conversas continua protegido pelas regras dos próprios Covils.</p>
            </div>
          )}

          {tab === 'connection' && (
            <div className="admin-connection">
              <section className="admin-health-line">
                <Health label="Internet do navegador" ok={navigator.onLine} detail={navigator.onLine ? 'Online' : 'Offline'} />
                <Health label="API e banco" ok={Boolean(overview)} detail={overview ? 'Respondendo' : 'Sem leitura'} />
                <Health label="Sala de voz" ok={voice.status === 'joined'} detail={voice.status === 'joined' ? 'Conectada' : 'Em espera'} />
                <Health label="Compartilhar tela" ok={canShareScreen} detail={canShareScreen ? 'Compativel' : 'Indisponivel'} />
              </section>
              <section className="admin-session-traffic">
                <div><small>ENVIO NESTA SESSÃO</small><strong>{formatBytes(voice.diagnostics.sessionBytesSent)}</strong></div>
                <div><small>RECEBIMENTO NESTA SESSÃO</small><strong>{formatBytes(voice.diagnostics.sessionBytesReceived)}</strong></div>
                <p>As chamadas são P2P: cada amigo recebe uma cópia do seu áudio e da sua tela. Estes contadores reiniciam ao sair da sala.</p>
              </section>
              <div className="admin-peer-list">
                {voice.diagnostics.peers.length === 0 ? (
                  <div className="admin-empty-connection"><Wifi size={24} /><strong>Nenhuma conexão P2P ativa</strong><span>Entre no Lobby com um amigo para acompanhar latência, perda e tráfego.</span></div>
                ) : voice.diagnostics.peers.map((peer) => (
                  <article className="admin-peer" key={peer.participantId}>
                    <header><strong>{peer.displayName}</strong><span className={`admin-status admin-status--${peer.connectionState}`}>{connectionLabel(peer.connectionState)}</span></header>
                    <div className="admin-peer__metrics">
                      <Metric label="Upload" value={formatBitrate(peer.uploadBitsPerSecond)} />
                      <Metric label="Download" value={formatBitrate(peer.downloadBitsPerSecond)} />
                      <Metric label="Latência" value={peer.roundTripTimeMs === null ? '—' : `${Math.round(peer.roundTripTimeMs)} ms`} />
                      <Metric label="Jitter" value={peer.jitterMs === null ? '—' : `${Math.round(peer.jitterMs)} ms`} />
                      <Metric label="Perdas" value={peer.packetsLost} />
                      <Metric label="Rota ICE" value={`${peer.localCandidateType ?? '—'} / ${peer.remoteCandidateType ?? '—'}`} />
                    </div>
                  </article>
                ))}
              </div>
              <p className="admin-privacy-note">Os diagnósticos mostram somente qualidade e volume. Endereços IP dos participantes não são exibidos.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="admin-metric"><small>{label}</small><strong>{value}</strong></div>
}

function Health({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="admin-health"><i className={ok ? 'is-ok' : ''} /><span><strong>{label}</strong><small>{detail}</small></span></div>
}
