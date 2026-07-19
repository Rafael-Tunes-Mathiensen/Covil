import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminOverview {
  registeredUsers: number
  covilsCount: number
  activeMemberships: number
  channelsCount: number
  messagesCount: number
  databaseSizeBytes: number
  messagesSizeBytes: number
  memberLimit: number
  generatedAt: string
}

export interface AdminAccessRow {
  userId: string
  displayName: string
  email: string
  userCreatedAt: string
  lastSignInAt: string | null
  covilId: string | null
  covilName: string | null
  membershipRole: 'owner' | 'member' | null
  joinedAt: string | null
  isAppAdmin: boolean
}

interface AdminOverviewRow {
  registered_users: number
  covils_count: number
  active_memberships: number
  channels_count: number
  messages_count: number
  database_size_bytes: number
  messages_size_bytes: number
  member_limit: number
  generated_at: string
}

interface AdminAccessRpcRow {
  user_id: string
  display_name: string
  email: string | null
  user_created_at: string
  last_sign_in_at: string | null
  covil_id: string | null
  covil_name: string | null
  membership_role: 'owner' | 'member' | null
  joined_at: string | null
  is_app_admin: boolean
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Não foi possível carregar o console administrativo.'
}

export function useAdminConsole(client: SupabaseClient) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [accessRows, setAccessRows] = useState<AdminAccessRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const statusResult = await client.rpc('is_app_admin')
      if (statusResult.error) throw statusResult.error

      const allowed = statusResult.data === true
      setIsAdmin(allowed)
      if (!allowed) {
        setOverview(null)
        setAccessRows([])
        return
      }

      const [overviewResult, accessResult] = await Promise.all([
        client.rpc('get_admin_overview'),
        client.rpc('get_admin_access'),
      ])
      if (overviewResult.error) throw overviewResult.error
      if (accessResult.error) throw accessResult.error

      const row = (overviewResult.data?.[0] ?? null) as AdminOverviewRow | null
      if (row) {
        setOverview({
          registeredUsers: Number(row.registered_users),
          covilsCount: Number(row.covils_count),
          activeMemberships: Number(row.active_memberships),
          channelsCount: Number(row.channels_count),
          messagesCount: Number(row.messages_count),
          databaseSizeBytes: Number(row.database_size_bytes),
          messagesSizeBytes: Number(row.messages_size_bytes),
          memberLimit: Number(row.member_limit),
          generatedAt: row.generated_at,
        })
      }

      setAccessRows(((accessResult.data ?? []) as AdminAccessRpcRow[]).map((access) => ({
        userId: access.user_id,
        displayName: access.display_name,
        email: access.email ?? 'Sem email',
        userCreatedAt: access.user_created_at,
        lastSignInAt: access.last_sign_in_at,
        covilId: access.covil_id,
        covilName: access.covil_name,
        membershipRole: access.membership_role,
        joinedAt: access.joined_at,
        isAppAdmin: access.is_app_admin,
      })))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    // A leitura inicial sincroniza o console com a allowlist e as metricas externas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const removeMember = useCallback(async (covilId: string, userId: string) => {
    const result = await client.rpc('admin_remove_covil_member', {
      p_covil_id: covilId,
      p_user_id: userId,
    })
    if (result.error) throw result.error
    await refresh()
  }, [client, refresh])

  return {
    isAdmin,
    isLoading,
    overview,
    accessRows,
    error,
    refresh,
    removeMember,
  }
}

export type AdminConsoleState = ReturnType<typeof useAdminConsole>
