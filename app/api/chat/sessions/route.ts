import { NextRequest, NextResponse } from 'next/server';
import { apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { ensureObject, readJsonBody, readOptionalBoolean, readOptionalString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { createChatSession, getOrCreateLatestChatSession, listChatSessions } from '@/lib/vault/chat';

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const sessions = await listChatSessions(supabase, user.id);
    return apiSuccess(sessions);
  } catch (error) {
    return handleApiRouteError(error, 'chat.sessions.list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const body = ensureObject(await readJsonBody(req));
    const title = readOptionalString(body.title, {
      field: 'Title',
      maxLength: 120,
    });
    const useLatest = readOptionalBoolean(body.useLatest, 'useLatest') ?? false;

    const session = useLatest
      ? await getOrCreateLatestChatSession(supabase, user.id)
      : await createChatSession(supabase, user.id, title);

    return apiSuccess(session, { status: 201 });
  } catch (error) {
    return handleApiRouteError(error, 'chat.sessions.create');
  }
}
