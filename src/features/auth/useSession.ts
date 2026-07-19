import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { appConfig } from '../../lib/config'
import { supabase } from '../../lib/supabase'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(appConfig.isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    isLoading,
    isDemo: !appConfig.isSupabaseConfigured,
  }
}
