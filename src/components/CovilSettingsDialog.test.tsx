import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CovilSettingsDialog } from './CovilSettingsDialog'
import type { Profile } from '../types/domain'

const owner: Profile = {
  id: 'owner',
  displayName: 'Tuneco',
  avatarColor: '#7a8cff',
  status: 'online',
  role: 'owner',
}

describe('CovilSettingsDialog', () => {
  it('permite criar cargo visual sem nenhuma permissão', async () => {
    const onCreateRole = vi.fn(async () => undefined)
    render(
      <CovilSettingsDialog
        assignments={[]}
        canRemoveMembers
        currentUser={owner}
        isSubmitting={false}
        members={[owner]}
        onClose={vi.fn()}
        onCreateRole={onCreateRole}
        onDeleteRole={vi.fn(async () => undefined)}
        onRemoveMember={vi.fn(async () => undefined)}
        onSetMemberRole={vi.fn(async () => undefined)}
        roles={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nome do cargo'), { target: { value: 'Raider' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar cargo' }))

    await waitFor(() => expect(onCreateRole).toHaveBeenCalledWith('Raider', '#ff7043', []))
  })
})
