import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CovilSettingsDialog } from './CovilSettingsDialog'
import type { CovilRole, Profile } from '../types/domain'

const covil = { id: 'covil', inviteCode: '', name: 'Meu Covil' }

const owner: Profile = {
  id: 'owner',
  displayName: 'Tuneco',
  avatarColor: '#7a8cff',
  avatarUrl: 'https://example.com/tuneco.png',
  status: 'online',
  role: 'owner',
}

const moderatorRole: CovilRole = {
  id: 'moderator',
  covilId: 'covil',
  name: 'Guardião',
  color: '#55c98a',
  permissions: ['moderate_voice'],
  position: 0,
}

describe('CovilSettingsDialog', () => {
  it('permite criar cargo visual sem nenhuma permissão', async () => {
    const onCreateRole = vi.fn(async () => undefined)
    render(
      <CovilSettingsDialog
        assignments={[]}
        canManageCovil
        canRemoveMembers
        covil={covil}
        currentUser={owner}
        isSubmitting={false}
        members={[owner]}
        onClose={vi.fn()}
        onCreateRole={onCreateRole}
        onUpdateRole={vi.fn(async () => undefined)}
        onDeleteRole={vi.fn(async () => undefined)}
        onRemoveMember={vi.fn(async () => undefined)}
        onSetMemberRole={vi.fn(async () => undefined)}
        onUpdateCovilName={vi.fn(async () => undefined)}
        roles={[]}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /Cargos/ }))
    fireEvent.change(screen.getByLabelText('Nome do cargo'), { target: { value: 'Raider' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar cargo' }))

    await waitFor(() => expect(onCreateRole).toHaveBeenCalledWith('Raider', '#ff7043', []))
  })

  it('permite editar um cargo e atribuí-lo ao próprio owner', async () => {
    const onUpdateRole = vi.fn(async () => undefined)
    const onSetMemberRole = vi.fn(async () => undefined)
    render(
      <CovilSettingsDialog
        assignments={[]}
        canManageCovil
        canRemoveMembers
        covil={covil}
        currentUser={owner}
        isSubmitting={false}
        members={[owner]}
        onClose={vi.fn()}
        onCreateRole={vi.fn(async () => undefined)}
        onDeleteRole={vi.fn(async () => undefined)}
        onRemoveMember={vi.fn(async () => undefined)}
        onSetMemberRole={onSetMemberRole}
        onUpdateCovilName={vi.fn(async () => undefined)}
        onUpdateRole={onUpdateRole}
        roles={[moderatorRole]}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /Cargos/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar cargo Guardião' }))
    fireEvent.change(screen.getByLabelText('Editar nome do cargo'), { target: { value: 'Sentinela' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cargo' }))
    await waitFor(() => expect(onUpdateRole).toHaveBeenCalledWith(
      'moderator',
      'Sentinela',
      '#55c98a',
      ['moderate_voice'],
    ))

    fireEvent.click(screen.getByRole('tab', { name: /Membros/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardião' }))
    await waitFor(() => expect(onSetMemberRole).toHaveBeenCalledWith('owner', 'moderator', true))
  })

  it('mostra a foto de perfil dos membros na gestão', () => {
    render(
      <CovilSettingsDialog
        assignments={[]}
        canManageCovil
        canRemoveMembers
        covil={covil}
        currentUser={owner}
        isSubmitting={false}
        members={[owner]}
        onClose={vi.fn()}
        onCreateRole={vi.fn(async () => undefined)}
        onDeleteRole={vi.fn(async () => undefined)}
        onRemoveMember={vi.fn(async () => undefined)}
        onSetMemberRole={vi.fn(async () => undefined)}
        onUpdateCovilName={vi.fn(async () => undefined)}
        onUpdateRole={vi.fn(async () => undefined)}
        roles={[]}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /Membros/ }))
    expect(screen.getByTitle('Tuneco').querySelector('img')).toHaveAttribute('src', owner.avatarUrl)
  })

  it('permite alterar o nome do Covil pela aba geral', async () => {
    const onUpdateCovilName = vi.fn(async () => undefined)
    render(
      <CovilSettingsDialog
        assignments={[]}
        canManageCovil
        canRemoveMembers
        covil={covil}
        currentUser={owner}
        isSubmitting={false}
        members={[owner]}
        onClose={vi.fn()}
        onCreateRole={vi.fn(async () => undefined)}
        onDeleteRole={vi.fn(async () => undefined)}
        onRemoveMember={vi.fn(async () => undefined)}
        onSetMemberRole={vi.fn(async () => undefined)}
        onUpdateCovilName={onUpdateCovilName}
        onUpdateRole={vi.fn(async () => undefined)}
        roles={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nome do Covil'), { target: { value: 'Covil Renovado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(onUpdateCovilName).toHaveBeenCalledWith('Covil Renovado'))
    expect(screen.getByRole('status')).toHaveTextContent('Nome do Covil atualizado.')
  })
})
