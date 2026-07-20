import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Profile } from '../types/domain'
import { ProfileDialog } from './ProfileDialog'

const profile: Profile = {
  id: 'owner',
  displayName: 'Tuneco',
  avatarColor: '#7a8cff',
  bio: 'Joga à noite.',
  status: 'online',
  role: 'owner',
}

describe('ProfileDialog', () => {
  it('mostra a descrição de outro membro sem controles da conta', () => {
    render(<ProfileDialog currentUserId="friend" onClose={vi.fn()} profile={profile} />)

    expect(screen.getByText('Joga à noite.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar perfil' })).not.toBeInTheDocument()
  })

  it('atualiza nome, descrição e senha da própria conta', async () => {
    const onUpdateProfile = vi.fn(async () => undefined)
    const onUpdatePassword = vi.fn(async () => undefined)
    render(
      <ProfileDialog
        currentUserId="owner"
        onClose={vi.fn()}
        onUpdatePassword={onUpdatePassword}
        onUpdateProfile={onUpdateProfile}
        profile={profile}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Rafael' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'No Covil.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }))
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith('Rafael', 'No Covil.'))

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'segredo123' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'segredo123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }))
    await waitFor(() => expect(onUpdatePassword).toHaveBeenCalledWith('segredo123'))
  })
})
