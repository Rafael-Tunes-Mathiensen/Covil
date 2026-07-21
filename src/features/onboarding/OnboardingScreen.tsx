import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, LoaderCircle, Plus } from 'lucide-react'
import { BrandMark } from '../../components/BrandMark'

interface OnboardingScreenProps {
  canCreate: boolean
  isSubmitting: boolean
  error: string | null
  onCreate: (name: string, memberLimit: number) => Promise<void>
  onJoin: (inviteCode: string) => Promise<void>
}

export function OnboardingScreen({
  canCreate,
  isSubmitting,
  error,
  onCreate,
  onJoin,
}: OnboardingScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>(canCreate ? 'create' : 'join')
  const [value, setValue] = useState('')
  const [memberLimit, setMemberLimit] = useState(6)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      if (mode === 'create') await onCreate(value.trim(), memberLimit)
      else await onJoin(value.trim().toUpperCase())
    } catch {
      // O hook exibe a mensagem sanitizada devolvida pelo backend.
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header"><BrandMark /></header>
      <section className="onboarding-content">
        <p className="eyebrow">PRIMEIRO PASSO</p>
        <h1>Onde sua equipe vai se encontrar?</h1>
        <p>{canCreate ? 'Crie um espaço privado ou use o convite enviado por um amigo.' : 'Use o convite enviado pelo fundador de um Covil.'}</p>

        <div className="onboarding-tabs" role="tablist" aria-label="Forma de entrada">
          {canCreate && (
            <button
              aria-selected={mode === 'create'}
              className={mode === 'create' ? 'is-active' : ''}
              onClick={() => { setMode('create'); setValue('') }}
              role="tab"
            >
              <Plus size={19} /> Criar Covil
            </button>
          )}
          <button
            aria-selected={mode === 'join'}
            className={mode === 'join' ? 'is-active' : ''}
            onClick={() => { setMode('join'); setValue('') }}
            role="tab"
          >
            <KeyRound size={19} /> Usar convite
          </button>
        </div>

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label>
            <span>{mode === 'create' ? 'Nome do seu espaço' : 'Código de convite'}</span>
            <input
              autoFocus
              maxLength={mode === 'create' ? 60 : 32}
              onChange={(event) => setValue(event.target.value)}
              placeholder={mode === 'create' ? 'Covil da Madrugada' : 'A1B2C3D4E5F60708192A3B4C5D6E7F80'}
              required
              value={value}
            />
          </label>
          {mode === 'create' && (
            <label>
              <span>Máximo de membros</span>
              <select onChange={(event) => setMemberLimit(Number(event.target.value))} value={memberLimit}>
                {[1, 2, 3, 4, 5, 6].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
              </select>
            </label>
          )}
          {error && <p className="form-feedback form-feedback--error">{error}</p>}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircle className="spin" size={19} /> : null}
            <span>{mode === 'create' ? 'Criar espaço' : 'Entrar no grupo'}</span>
            {!isSubmitting && <ArrowRight size={19} />}
          </button>
        </form>
      </section>
    </main>
  )
}
