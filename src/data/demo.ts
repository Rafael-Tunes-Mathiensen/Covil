import type { Channel, ChatMessage, Covil, Profile } from '../types/domain'

export const demoCovil: Covil = {
  id: 'demo-covil',
  name: 'Covil da Madrugada',
  inviteCode: '4F2A8C71D930B5E6287C41AD9B05E37',
}

export const demoChannels: Channel[] = [
  { id: 'general', covilId: demoCovil.id, name: 'geral', kind: 'text', position: 0 },
  { id: 'clips', covilId: demoCovil.id, name: 'clipes-e-caos', kind: 'text', position: 1 },
  { id: 'lobby', covilId: demoCovil.id, name: 'Lobby', kind: 'voice', position: 2 },
]

export const demoMembers: Profile[] = [
  {
    id: 'demo-user',
    displayName: 'Você',
    avatarColor: '#ff7043',
    status: 'online',
    role: 'owner',
  },
  {
    id: 'nina',
    displayName: 'Nina',
    avatarColor: '#7a8cff',
    status: 'online',
    role: 'member',
  },
  {
    id: 'caio',
    displayName: 'Caio',
    avatarColor: '#55c98a',
    status: 'online',
    role: 'member',
  },
  {
    id: 'bia',
    displayName: 'Bia',
    avatarColor: '#d58cff',
    status: 'away',
    role: 'member',
  },
]

const today = new Date()
today.setHours(20, 42, 0, 0)

export const demoMessages: ChatMessage[] = [
  {
    id: 'message-1',
    channelId: 'general',
    authorId: 'nina',
    content: 'Fechou partida hoje? Entro depois das nove.',
    createdAt: today.toISOString(),
    author: demoMembers[1],
  },
  {
    id: 'message-2',
    channelId: 'general',
    authorId: 'caio',
    content: 'Sim. Já deixei tudo atualizado dessa vez 😅',
    createdAt: new Date(today.getTime() + 4 * 60_000).toISOString(),
    author: demoMembers[2],
  },
  {
    id: 'message-3',
    channelId: 'general',
    authorId: 'demo-user',
    content: 'Perfeito. Às 21h eu abro o Lobby.',
    createdAt: new Date(today.getTime() + 7 * 60_000).toISOString(),
    author: demoMembers[0],
  },
]
