import { describe, expect, it } from 'vitest'
import type { CovilRole, MemberRoleAssignment } from '../../types/domain'
import { getEffectivePermissions, hasCovilPermission } from './permissions'

const roles: CovilRole[] = [
  {
    id: 'role-channel',
    covilId: 'covil',
    name: 'Arquiteto',
    color: '#ff7043',
    permissions: ['manage_channels', 'manage_covil'],
    position: 0,
  },
  {
    id: 'role-guardian',
    covilId: 'covil',
    name: 'Guardião',
    color: '#7a8cff',
    permissions: ['moderate_voice', 'remove_members'],
    position: 1,
  },
]

const assignments: MemberRoleAssignment[] = [
  { covilId: 'covil', userId: 'member', roleId: 'role-channel' },
  { covilId: 'covil', userId: 'member', roleId: 'role-guardian' },
]

describe('permissões do Covil', () => {
  it('concede todas as capacidades ao fundador sem depender de cargos', () => {
    expect(getEffectivePermissions('owner', 'owner', roles, [])).toEqual([
      'manage_channels',
      'moderate_voice',
      'remove_members',
      'manage_covil',
    ])
  })

  it('combina as permissões de todos os cargos atribuídos ao membro', () => {
    const permissions = getEffectivePermissions('member', 'member', roles, assignments)

    expect(permissions).toEqual([
      'manage_channels',
      'moderate_voice',
      'remove_members',
      'manage_covil',
    ])
    expect(hasCovilPermission(permissions, 'moderate_voice')).toBe(true)
    expect(hasCovilPermission(permissions, 'manage_covil')).toBe(true)
  })

  it('não concede capacidades sem um cargo correspondente', () => {
    expect(getEffectivePermissions('member', 'another-member', roles, assignments)).toEqual([])
  })

  it('mantém um cargo visual sem conceder capacidades', () => {
    const visualRole: CovilRole = {
      id: 'role-visual',
      covilId: 'covil',
      name: 'Raider',
      color: '#55c98a',
      permissions: [],
      position: 2,
    }
    const visualAssignment: MemberRoleAssignment = {
      covilId: 'covil',
      userId: 'visual-member',
      roleId: visualRole.id,
    }

    expect(getEffectivePermissions('member', 'visual-member', [visualRole], [visualAssignment])).toEqual([])
  })
})
