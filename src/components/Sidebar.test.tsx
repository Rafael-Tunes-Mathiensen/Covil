import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel, Covil, Profile } from '../types/domain'
import { Sidebar } from './Sidebar'

const covil: Covil = { id: 'covil', inviteCode: '', name: 'Meu Covil' }
const currentUser: Profile = {
  avatarColor: '#7a8cff',
  displayName: 'Tuneco',
  id: 'owner',
  role: 'owner',
  status: 'online',
}
const channels: Channel[] = [
  { covilId: 'covil', id: 'geral', kind: 'text', name: 'geral', position: 0 },
  { covilId: 'covil', id: 'codigos', kind: 'text', name: 'códigos', position: 1 },
  { covilId: 'covil', id: 'lobby', kind: 'voice', name: 'Lobby', position: 0 },
]

describe('Sidebar', () => {
  it('abre as configurações ao clicar no nome do Covil quando autorizado', () => {
    const onOpenCovilSettings = vi.fn()
    render(
      <Sidebar
        canManageCovil
        channels={channels}
        covil={covil}
        currentChannelId="geral"
        currentUser={currentUser}
        onOpenCovilSettings={onOpenCovilSettings}
        onSelectChannel={vi.fn()}
        voiceChannelId={null}
        voiceStatus="idle"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configurações de Meu Covil' }))
    expect(onOpenCovilSettings).toHaveBeenCalledTimes(1)
  })

  it('permite arrastar canais do mesmo tipo para reordená-los', () => {
    const onReorderChannels = vi.fn(async () => undefined)
    render(
      <Sidebar
        canManageChannels
        channels={channels}
        covil={covil}
        currentChannelId="geral"
        currentUser={currentUser}
        onReorderChannels={onReorderChannels}
        onSelectChannel={vi.fn()}
        voiceChannelId={null}
        voiceStatus="idle"
      />,
    )

    const source = screen.getByRole('button', { name: 'Canal de texto geral' })
    const target = screen.getByRole('button', { name: 'Canal de texto códigos' })
    const dataTransfer = { dropEffect: 'none', effectAllowed: 'none', setData: vi.fn() }

    expect(source).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(onReorderChannels).toHaveBeenCalledWith('text', ['codigos', 'geral'])
  })
})
