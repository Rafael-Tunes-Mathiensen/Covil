import { useState, type FormEvent } from 'react'
import { BarChart3, Dices, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react'

import { Dialog } from './Dialog'

export type ChatCommand = 'poll' | 'roulette' | 'dice'

interface ChatCommandDialogProps {
  command: ChatCommand
  onClose: () => void
  onCreatePoll: (question: string, options: string[]) => Promise<void>
  onSendResult: (content: string) => Promise<void>
}

export function ChatCommandDialog({
  command,
  onClose,
  onCreatePoll,
  onSendResult,
}: ChatCommandDialogProps) {
  if (command === 'poll') {
    return <PollBuilder onClose={onClose} onCreate={onCreatePoll} />
  }
  if (command === 'roulette') {
    return <RouletteBuilder onClose={onClose} onSendResult={onSendResult} />
  }
  return <DiceBuilder onClose={onClose} onSendResult={onSendResult} />
}

function PollBuilder({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (question: string, options: string[]) => Promise<void>
}) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedOptions = options.map((option) => option.trim()).filter(Boolean)
    if (!question.trim() || normalizedOptions.length < 2 || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onCreate(question.trim(), normalizedOptions)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a votação.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog className="command-dialog" eyebrow="COMANDO /VOTAÇÃO" onClose={onClose} title="Criar votação">
      <form className="command-form" onSubmit={submit}>
        <label>
          <span>Pergunta</span>
          <input
            data-autofocus
            maxLength={200}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Qual jogo vamos abrir hoje?"
            value={question}
          />
        </label>
        <fieldset className="command-options">
          <legend>Opções</legend>
          {options.map((option, index) => (
            <div key={index}>
              <span>{index + 1}</span>
              <input
                aria-label={`Opção ${index + 1}`}
                maxLength={80}
                onChange={(event) => setOptions((current) => current.map((value, optionIndex) => (
                  optionIndex === index ? event.target.value : value
                )))}
                placeholder={index === 0 ? 'Primeira opção' : 'Outra opção'}
                value={option}
              />
              {options.length > 2 && (
                <button
                  aria-label={`Remover opção ${index + 1}`}
                  onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <button className="command-add-option" onClick={() => setOptions((current) => [...current, ''])} type="button">
              <Plus size={15} /> Adicionar opção
            </button>
          )}
        </fieldset>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <button
          className="primary-button primary-button--compact"
          disabled={!question.trim() || options.filter((option) => option.trim()).length < 2 || isSubmitting}
          type="submit"
        >
          <BarChart3 size={17} /> Publicar votação
        </button>
      </form>
    </Dialog>
  )
}

function RouletteBuilder({
  onClose,
  onSendResult,
}: {
  onClose: () => void
  onSendResult: (content: string) => Promise<void>
}) {
  const [options, setOptions] = useState(['', ''])
  const [isSpinning, setIsSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function spin() {
    const values = options.map((option) => option.trim()).filter(Boolean)
    if (values.length < 2 || isSpinning) return
    setError(null)
    setResult(null)
    setIsSpinning(true)
    const selectedIndex = randomIntInclusive(0, values.length - 1)
    const segmentAngle = 360 / values.length
    setRotation((current) => current + 1_800 + (360 - selectedIndex * segmentAngle))
    await delay(1_650)
    const selected = values[selectedIndex]
    setResult(selected)
    try {
      await onSendResult(`🎡 Roleta: ${selected} · opções: ${values.join(' / ')}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar o resultado.')
    } finally {
      setIsSpinning(false)
    }
  }

  return (
    <Dialog className="command-dialog" eyebrow="COMANDO /ROLETA" onClose={onClose} title="Girar roleta">
      <div className="roulette-layout">
        <div className="roulette-stage">
          <i className="roulette-pointer" />
          <div
            aria-label="Roleta"
            className={isSpinning ? 'roulette-wheel is-spinning' : 'roulette-wheel'}
            style={{ '--roulette-rotation': `${rotation}deg` } as React.CSSProperties}
          >
            <Sparkles size={34} />
          </div>
          <strong aria-live="polite">{result ? `Resultado: ${result}` : 'Adicione as opções e gire'}</strong>
        </div>
        <fieldset className="command-options">
          <legend>Opções da roleta</legend>
          {options.map((option, index) => (
            <div key={index}>
              <span>{index + 1}</span>
              <input
                aria-label={`Opção ${index + 1}`}
                disabled={isSpinning}
                maxLength={60}
                onChange={(event) => setOptions((current) => current.map((value, optionIndex) => (
                  optionIndex === index ? event.target.value : value
                )))}
                value={option}
              />
              {options.length > 2 && (
                <button aria-label={`Remover opção ${index + 1}`} disabled={isSpinning} onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))} type="button">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {options.length < 12 && (
            <button className="command-add-option" disabled={isSpinning} onClick={() => setOptions((current) => [...current, ''])} type="button">
              <Plus size={15} /> Adicionar opção
            </button>
          )}
        </fieldset>
      </div>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <button className="primary-button primary-button--compact" disabled={options.filter((option) => option.trim()).length < 2 || isSpinning} onClick={() => void spin()} type="button">
        <RotateCw className={isSpinning ? 'spin' : ''} size={17} /> {isSpinning ? 'Girando…' : 'Girar roleta'}
      </button>
    </Dialog>
  )
}

function DiceBuilder({
  onClose,
  onSendResult,
}: {
  onClose: () => void
  onSendResult: (content: string) => Promise<void>
}) {
  const [minimum, setMinimum] = useState(1)
  const [maximum, setMaximum] = useState(20)
  const [isRolling, setIsRolling] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function roll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (minimum > maximum || isRolling) return
    setError(null)
    setResult(null)
    setIsRolling(true)
    await delay(650)
    const value = randomIntInclusive(minimum, maximum)
    setResult(value)
    try {
      await onSendResult(`🎲 Dado de ${minimum} a ${maximum}: ${value}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar o resultado.')
    } finally {
      setIsRolling(false)
    }
  }

  return (
    <Dialog className="command-dialog dice-dialog" eyebrow="COMANDO /DADO" onClose={onClose} title="Rolar dado">
      <div className={isRolling ? 'dice-result is-rolling' : 'dice-result'} aria-live="polite">
        <Dices size={38} />
        <strong>{result ?? '?'}</strong>
      </div>
      <form className="dice-form" onSubmit={roll}>
        <label><span>Valor mínimo</span><input onChange={(event) => setMinimum(Number(event.target.value))} type="number" value={minimum} /></label>
        <label><span>Valor máximo</span><input onChange={(event) => setMaximum(Number(event.target.value))} type="number" value={maximum} /></label>
        {minimum > maximum && <p className="dialog-error" role="alert">O mínimo precisa ser menor ou igual ao máximo.</p>}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--compact" disabled={minimum > maximum || isRolling} type="submit">
          <Dices size={17} /> {isRolling ? 'Rolando…' : 'Rolar dado'}
        </button>
      </form>
    </Dialog>
  )
}

function randomIntInclusive(minimum: number, maximum: number) {
  const lower = Math.ceil(Math.min(minimum, maximum))
  const upper = Math.floor(Math.max(minimum, maximum))
  const range = upper - lower + 1
  const sampleSpace = 0x1_0000_0000
  if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || range <= 0 || range > sampleSpace) {
    throw new Error('Intervalo inválido.')
  }
  const random = new Uint32Array(1)
  const unbiasedLimit = Math.floor(sampleSpace / range) * range
  do {
    crypto.getRandomValues(random)
  } while (random[0] >= unbiasedLimit)
  return lower + (random[0] % range)
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}
