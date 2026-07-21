import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ChevronDown, KeyRound, Plus, Settings, ShieldCheck, Users } from 'lucide-react'
import type { Covil, CovilSummary } from '../types/domain'

interface CovilSwitcherMenuProps {
  activeCovil: Covil
  availableCovils: readonly CovilSummary[]
  canCreateCovil: boolean
  canManageCovil: boolean
  isSubmitting: boolean
  onCreateCovil?: (name: string, memberLimit: number) => Promise<void>
  onJoinCovil?: (inviteCode: string) => Promise<void>
  onOpenSettings?: () => void
  onSwitchCovil: (covilId: string) => Promise<void>
}

export function CovilSwitcherMenu({
  activeCovil,
  availableCovils,
  canCreateCovil,
  canManageCovil,
  isSubmitting,
  onCreateCovil,
  onJoinCovil,
  onOpenSettings,
  onSwitchCovil,
}: CovilSwitcherMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [action, setAction] = useState<'create' | 'join' | null>(null)
  const [value, setValue] = useState('')
  const [memberLimit, setMemberLimit] = useState(6)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    function closeFromEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromEscape)
    }
  }, [])

  function beginAction(nextAction: 'create' | 'join') {
    setAction(nextAction)
    setValue('')
    setMemberLimit(6)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value.trim() || isSubmitting) return
    setError(null)
    try {
      if (action === 'create' && onCreateCovil) await onCreateCovil(value.trim(), memberLimit)
      if (action === 'join' && onJoinCovil) await onJoinCovil(value.trim().toUpperCase())
      setIsOpen(false)
      setAction(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.')
    }
  }

  return (
    <div className="covil-switcher-wrap" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Trocar de Covil. Atual: ${activeCovil.name}`}
        className="covil-switcher is-actionable"
        onClick={() => { setIsOpen((current) => !current); setAction(null); setError(null) }}
        title="Trocar de Covil"
        type="button"
      >
        <span>{activeCovil.name}</span><ChevronDown className={isOpen ? 'is-open' : ''} size={17} />
      </button>

      {isOpen && (
        <section aria-label="Seletor de Covils" className="covil-menu">
          {action ? (
            <form className="covil-menu__form" onSubmit={submit}>
              <header>
                <button onClick={() => setAction(null)} type="button">Voltar</button>
                <strong>{action === 'create' ? 'Novo Covil' : 'Entrar em outro Covil'}</strong>
              </header>
              <label>
                <span>{action === 'create' ? 'Nome' : 'Código de convite'}</span>
                <input
                  autoFocus
                  maxLength={action === 'create' ? 60 : 32}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={action === 'create' ? 'Covil da Madrugada' : 'Cole o convite aqui'}
                  required
                  value={value}
                />
              </label>
              {action === 'create' && (
                <label>
                  <span>Máximo de membros</span>
                  <select onChange={(event) => setMemberLimit(Number(event.target.value))} value={memberLimit}>
                    {[1, 2, 3, 4, 5, 6].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
                  </select>
                </label>
              )}
              {error && <p className="dialog-error" role="alert">{error}</p>}
              <button className="covil-menu__submit" disabled={isSubmitting} type="submit">
                {action === 'create' ? <Plus size={16} /> : <KeyRound size={16} />}
                {action === 'create' ? 'Criar e abrir' : 'Entrar e abrir'}
              </button>
            </form>
          ) : (
            <>
              <header className="covil-menu__header"><span>SEUS COVILS</span><small>{availableCovils.length}</small></header>
              <div className="covil-menu__list" role="menu">
                {availableCovils.map((candidate) => (
                  <button
                    className={candidate.id === activeCovil.id ? 'is-active' : ''}
                    key={candidate.id}
                    onClick={() => {
                      if (candidate.id === activeCovil.id) return
                      void onSwitchCovil(candidate.id).then(() => setIsOpen(false)).catch((cause) => {
                        setError(cause instanceof Error ? cause.message : 'Não foi possível trocar de Covil.')
                      })
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="covil-menu__avatar">{candidate.name.slice(0, 2).toUpperCase()}</span>
                    <span><strong>{candidate.name}</strong><small><Users size={11} /> até {candidate.memberLimit} · {candidate.role === 'owner' ? 'Fundador' : 'Membro'}</small></span>
                    {candidate.id === activeCovil.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              {error && <p className="covil-menu__error" role="alert">{error}</p>}
              <footer className="covil-menu__actions">
                {canManageCovil && onOpenSettings && <button onClick={() => { setIsOpen(false); onOpenSettings() }} type="button"><Settings size={16} /> Configurar atual</button>}
                {onJoinCovil && <button onClick={() => beginAction('join')} type="button"><KeyRound size={16} /> Usar convite</button>}
                {canCreateCovil && onCreateCovil && <button className="is-owner-action" onClick={() => beginAction('create')} type="button"><ShieldCheck size={16} /> Criar novo Covil</button>}
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  )
}
