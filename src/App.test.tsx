import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App em modo de demonstração', () => {
  it('permite navegar até a sala de voz sem pedir o microfone automaticamente', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Lobby' }))

    expect(
      screen.getByRole('heading', { name: 'O Lobby está esperando.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Entrar na voz' }),
    ).toBeInTheDocument()
  })

  it('adiciona uma mensagem local ao canal atual', async () => {
    render(<App />)
    const input = screen.getByRole('textbox', { name: 'Mensagem em geral' })

    fireEvent.change(input, { target: { value: 'Mensagem criada no teste.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))

    await waitFor(() => {
      expect(screen.getByText('Mensagem criada no teste.')).toBeInTheDocument()
    })
  })
})
