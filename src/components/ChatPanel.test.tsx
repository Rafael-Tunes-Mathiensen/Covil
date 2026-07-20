import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'
import type { Channel, ChatMessage, CovilRole, MemberRoleAssignment, Profile } from '../types/domain'
import styles from '../styles/index.css?raw'

const channel: Channel = {
  id: 'general',
  covilId: 'covil',
  name: 'geral',
  kind: 'text',
  position: 0,
}

const members: Profile[] = [
  { id: 'current', displayName: 'Tuneco', avatarColor: '#7a8cff', status: 'online', role: 'owner' },
  { id: 'nina', displayName: 'Nina', avatarColor: '#55c98a', status: 'online', role: 'member' },
]

const roles: CovilRole[] = [
  { id: 'raider', covilId: 'covil', name: 'Raider', color: '#55c98a', permissions: [], position: 0 },
]

const assignments: MemberRoleAssignment[] = [
  { covilId: 'covil', userId: 'nina', roleId: 'raider' },
]

const messages: ChatMessage[] = [
  {
    id: 'other-message',
    channelId: 'general',
    authorId: 'nina',
    content: 'Oi @Tuneco',
    createdAt: '2026-07-19T20:00:00.000Z',
    updatedAt: '2026-07-19T20:00:00.000Z',
    author: members[1],
  },
  {
    id: 'own-message',
    channelId: 'general',
    authorId: 'current',
    content: 'Mensagem original',
    createdAt: '2026-07-19T20:05:00.000Z',
    updatedAt: '2026-07-19T20:05:00.000Z',
    author: members[0],
  },
]

function renderChat(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  const props: React.ComponentProps<typeof ChatPanel> = {
    channel,
    currentUserId: 'current',
    isDemo: false,
    memberRoleAssignments: assignments,
    members,
    messages,
    onDelete: vi.fn(async () => undefined),
    onEdit: vi.fn(async () => undefined),
    onCreatePoll: vi.fn(async () => undefined),
    onSend: vi.fn(async () => undefined),
    onToggleMembers: vi.fn(),
    onVotePoll: vi.fn(async () => undefined),
    roles,
    ...overrides,
  }
  return { ...render(<ChatPanel {...props} />), props }
}

describe('ChatPanel', () => {
  it('mantém o nome do autor legível sobre o fundo escuro do chat', () => {
    renderChat()

    const author = screen.getByRole('button', { name: 'Nina' })
    expect(author).toHaveClass('message__author')

    expect(styles).toMatch(/\.message__author\s*\{[^}]*background:\s*transparent;/s)
  })

  it('oferece menções e destaca quando o usuário atual foi marcado', () => {
    renderChat()

    expect(document.querySelector('.message-mention--self')).toHaveTextContent('@Tuneco')
    expect(screen.getByText('Raider')).toBeInTheDocument()

    const composer = screen.getByLabelText('Mensagem em geral')
    fireEvent.change(composer, { target: { value: '@Ni', selectionStart: 3 } })
    expect(screen.getByRole('option', { name: 'Nina' })).toBeInTheDocument()
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(composer).toHaveValue('@Nina ')
  })

  it('permite ao autor editar e confirmar a exclusão da própria mensagem', async () => {
    const onEdit = vi.fn(async () => undefined)
    const onDelete = vi.fn(async () => undefined)
    renderChat({ onDelete, onEdit })

    expect(screen.getAllByRole('button', { name: 'Editar mensagem' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Editar mensagem' }))
    fireEvent.change(screen.getByLabelText('Editar mensagem'), { target: { value: 'Mensagem editada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar edição' }))
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('own-message', 'Mensagem editada'))

    fireEvent.click(screen.getByRole('button', { name: 'Excluir mensagem' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão da mensagem' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('own-message'))
  })

  it('abre os comandos com barra e publica uma votação', async () => {
    const onCreatePoll = vi.fn(async () => undefined)
    renderChat({ onCreatePoll })

    fireEvent.change(screen.getByLabelText('Mensagem em geral'), { target: { value: '/' } })
    fireEvent.click(screen.getByRole('option', { name: /votação/i }))
    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'Qual jogo?' } })
    fireEvent.change(screen.getByLabelText('Opção 1'), { target: { value: 'Valorant' } })
    fireEvent.change(screen.getByLabelText('Opção 2'), { target: { value: 'Minecraft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar votação' }))

    await waitFor(() => expect(onCreatePoll).toHaveBeenCalledWith('Qual jogo?', ['Valorant', 'Minecraft']))
  })

  it('mostra os votos e permite votar em uma opção', async () => {
    const onVotePoll = vi.fn(async () => undefined)
    const pollMessage: ChatMessage = {
      ...messages[0],
      id: 'poll',
      content: 'Hoje tem ranked?',
      kind: 'poll',
      poll: {
        options: ['Sim', 'Não'],
        votes: [{ userId: 'nina', optionIndex: 0 }],
      },
    }
    renderChat({ messages: [pollMessage], onVotePoll })

    fireEvent.click(screen.getByRole('button', { name: /Sim/ }))
    await waitFor(() => expect(onVotePoll).toHaveBeenCalledWith('poll', 0))
    expect(screen.getByText(/1 pessoa votou/)).toBeInTheDocument()
  })
})
