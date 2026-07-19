import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { BrandMark } from '../../components/BrandMark'
import { supabase } from '../../lib/supabase'

type AuthMode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setIsSubmitting(true)
    setFeedback(null)
    setIsError(false)

    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName.trim() } },
          })

    setIsSubmitting(false)

    if (result.error) {
      setIsError(true)
      setFeedback(result.error.message)
      return
    }

    if (mode === 'sign-up' && !result.data.session) {
      setFeedback('Conta criada. Confirme o e-mail para entrar no Covil.')
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setFeedback(null)
    setIsError(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-atmosphere" aria-label="Apresentação do Covil">
        <div className="auth-atmosphere__glow" />
        <BrandMark />
        <div className="auth-atmosphere__copy">
          <p className="eyebrow">Seu grupo. Sua frequência.</p>
          <h1>Entre.<br />Fale. Jogue.</h1>
          <p>Voz, mensagens e tela compartilhada em um espaço que pertence a vocês.</p>
        </div>
        <div className="signal-lines" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__inner">
          <p className="auth-panel__kicker">ACESSO PRIVADO</p>
          <h2>{mode === 'sign-in' ? 'Bem-vindo de volta.' : 'Abra seu Covil.'}</h2>
          <p className="auth-panel__intro">
            {mode === 'sign-in'
              ? 'Entre para encontrar sua equipe.'
              : 'Crie sua conta e convide até três amigos.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'sign-up' && (
              <label>
                <span>Como devemos chamar você?</span>
                <input
                  autoComplete="name"
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Seu nome"
                  required
                  value={displayName}
                />
              </label>
            )}

            <label>
              <span>E-mail</span>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label>
              <span>Senha</span>
              <span className="password-field">
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {feedback && (
              <p className={isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {feedback}
              </p>
            )}

            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? <LoaderCircle className="spin" size={19} /> : null}
              <span>{mode === 'sign-in' ? 'Entrar no Covil' : 'Criar minha conta'}</span>
              {!isSubmitting && <ArrowRight size={19} />}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'sign-in' ? 'Ainda não tem acesso?' : 'Já criou sua conta?'}{' '}
            <button onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </section>
    </main>
  )
}
