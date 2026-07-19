import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, LoaderCircle, Plus } from 'lucide-react'
import { BrandMark } from '../../components/BrandMark'

interface OnboardingScreenProps {
  isSubmitting: boolean
  error: string | null
  onCreate: (name: string) => Promise<void>
  onJoin: (inviteCode: string) => Promise<void>
}

export function OnboardingScreen({
  isSubmitting,
  error,
  onCreate,
  onJoin,
}: OnboardingScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [value, setValue] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'create') await onCreate(value.trim())
    else await onJoin(value.trim().toUpperCase())
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header"><BrandMark /></header>
      <section className="onboarding-content">
        <p className="eyebrow">PRIMEIRO PASSO</p>
        <h1>Onde sua equipe vai se encontrar?</h1>
        <p>Crie um espaço privado ou use o convite enviado por um amigo.</p>

        <div className="onboarding-tabs" role="tablist" aria-label="Forma de entrada">
          <button
            aria-selected={mode === 'create'}
            className={mode === 'create' ? 'is-active' : ''}
            onClick={() => { setMode('create'); setValue('') }}
            role="tab"
          >
            <Plus size={19} /> Criar Covil
          </button>
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
