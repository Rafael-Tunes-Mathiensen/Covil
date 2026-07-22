import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '../types/domain'
import { RenameChannelDialog } from './RenameChannelDialog'

const channel: Channel = {
  covilId: 'covil',
  id: 'lobby',
  kind: 'voice',
  name: 'Lobby',
  position: 0,
}

describe('RenameChannelDialog', () => {
  it('envia o novo nome normalizado para o canal selecionado', async () => {
    const onClose = vi.fn()
    const onRename = vi.fn(async () => undefined)
    render(
      <RenameChannelDialog
        channel={channel}
        isSubmitting={false}
        onClose={onClose}
        onRename={onRename}
      />,
    )

    fireEvent.change(screen.getByLabelText('Novo nome da sala de voz'), {
      target: { value: '  Jogatina  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))

    expect(onRename).toHaveBeenCalledWith('lobby', 'Jogatina')
  })
})
