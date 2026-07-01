import { type createClient as createServerClientFactory } from '@/lib/supabase/server';
import { ApiRouteError } from '@/lib/api/errors';
import { getSafeUser } from '@/lib/supabase/auth';

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClientFactory>>;

export async function requireApiUser(supabase: ServerSupabaseClient) {
  const { user, hadRecoverableAuthError } = await getSafeUser(supabase);

  if (!user) {
    throw new ApiRouteError(
      401,
      hadRecoverableAuthError ? 'Your session expired. Please log in again.' : 'Unauthorized',
      { code: 'unauthorized' }
    );
  }

  return user;
}
