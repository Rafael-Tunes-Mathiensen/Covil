import {
  covilPermissions,
  type CovilPermission,
  type CovilRole,
  type MemberRole,
  type MemberRoleAssignment,
} from '../../types/domain'

export function getEffectivePermissions(
  membershipRole: MemberRole,
  userId: string,
  roles: readonly CovilRole[],
  assignments: readonly MemberRoleAssignment[],
): CovilPermission[] {
  if (membershipRole === 'owner') return [...covilPermissions]

  const assignedRoleIds = new Set(
    assignments
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => assignment.roleId),
  )
  const granted = new Set<CovilPermission>()

  for (const role of roles) {
    if (!assignedRoleIds.has(role.id)) continue
    for (const permission of role.permissions) granted.add(permission)
  }

  return covilPermissions.filter((permission) => granted.has(permission))
}

export function hasCovilPermission(
  permissions: readonly CovilPermission[],
  permission: CovilPermission,
) {
  return permissions.includes(permission)
}
