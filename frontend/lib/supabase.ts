import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

function makeSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

let client: SupabaseClient | undefined

/**
 * Lazily-initialized Supabase browser client.
 * The underlying client is created on first property access so that module
 * imports don't fail during static generation when env vars are runtime-only.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!client) client = makeSupabaseClient()
    return client[prop as keyof SupabaseClient]
  },
})

/** Subscribe to real-time inserts on the orders table for a given shop. */
export function subscribeToOrders(
  shopId: string,
  onInsert: (order: Record<string, unknown>) => void,
): () => void {
  const channel = supabase
    .channel(`orders-${shopId}`)
    .on<Record<string, unknown>>(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `shop_id=eq.${shopId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (payload.new) {
          onInsert(payload.new)
        }
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
