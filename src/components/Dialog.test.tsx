import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('move o foco para a primeira ação e fecha com Escape', () => {
    const onClose = vi.fn()
    render(
      <Dialog onClose={onClose} title="Novo canal">
        <input aria-label="Nome" />
        <button type="button">Criar</button>
      </Dialog>,
    )

    expect(screen.getByLabelText('Nome')).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('fecha ao clicar somente no fundo do diálogo', () => {
    const onClose = vi.fn()
    render(
      <Dialog onClose={onClose} title="Configurações">
        <button type="button">Dentro</button>
      </Dialog>,
    )

    fireEvent.mouseDown(screen.getByTestId('dialog-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
