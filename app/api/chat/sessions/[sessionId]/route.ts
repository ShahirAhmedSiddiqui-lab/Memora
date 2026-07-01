import { apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { readUuid } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { assertChatSessionOwnership } from '@/lib/vault/chat';

export async function DELETE(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const normalizedSessionId = readUuid(sessionId, 'Session id');
    await assertChatSessionOwnership(supabase, user.id, normalizedSessionId);

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', normalizedSessionId)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return apiSuccess({ success: true });
  } catch (error) {
    return handleApiRouteError(error, 'chat.sessions.delete');
  }
}
