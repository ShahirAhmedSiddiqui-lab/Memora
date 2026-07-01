import { NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { logApiEvent } from '@/lib/api/logging';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { ensureObject, readJsonBody, readOptionalBoolean, readRequiredString, readUuid } from '@/lib/api/validation';
import { generateVaultChatAnswer } from '@/lib/ai/service';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateProfile, normalizeUserPreferences } from '@/lib/supabase/profile';
import { mapChatMessage, mapKnowledgeItem } from '@/lib/supabase/vault';
import { buildChatSessionTitle, getOrCreateLatestChatSession, touchChatSession } from '@/lib/vault/chat';

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const session = await getOrCreateLatestChatSession(supabase, user.id);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return apiSuccess((data ?? []).map(mapChatMessage));
  } catch (error) {
    return handleApiRouteError(error, 'chat.legacy.list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    enforceRateLimit({
      key: `chat:legacy:${user.id}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Too many chat requests. Please wait a minute and try again.',
      code: 'chat_rate_limited',
    });

    const body = ensureObject(await readJsonBody(req));
    const query = readRequiredString(body.query, {
      field: 'Query',
      minLength: 1,
      maxLength: 2_000,
    });
    const persist = readOptionalBoolean(body.persist, 'persist') ?? true;
    const itemIds = readOptionalItemIds(body.itemIds);

    const session = persist
      ? await getOrCreateLatestChatSession(supabase, user.id)
      : null;

    let itemQuery = supabase
      .from('knowledge_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('processing_status', 'ready')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (itemIds.length > 0) {
      itemQuery = itemQuery.in('id', itemIds);
    }

    const [{ data: existingChats, error: chatError }, { data: itemRows, error: itemError }, profile] = await Promise.all([
      persist && session
        ? supabase
            .from('chat_messages')
            .select('*')
            .eq('user_id', user.id)
            .eq('session_id', session.id)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      itemQuery,
      getOrCreateProfile(supabase, user),
    ]);

    if (chatError) {
      throw chatError;
    }
    if (itemError) {
      throw itemError;
    }

    const items = (itemRows ?? []).map((row) => mapKnowledgeItem(row));
    const formattedHistory = (existingChats ?? []).map((chat) => ({
      role: chat.role,
      content: chat.content,
    }));
    const preferences = normalizeUserPreferences(profile.preferences);
    const aiResponse = await generateVaultChatAnswer(query, items, formattedHistory, {
      responseStyle: preferences.brainResponseStyle,
    });

    if (!persist) {
      return apiSuccess(
        {
          userMessage: {
            id: `preview-user-${Date.now()}`,
            role: 'user',
            content: query,
            createdAt: 'Just now',
          },
          modelMessage: {
            id: `preview-model-${Date.now()}`,
            role: 'model',
            content: aiResponse.answer,
            summaryBlock: aiResponse.summaryBlock,
            referencedSources: aiResponse.referencedSources,
            tags: aiResponse.tags,
            createdAt: 'Just now',
          },
        },
        { status: 201 }
      );
    }

    if (!session) {
      throw new Error('Chat session was not initialized.');
    }

    const lastMessageAt = new Date().toISOString();
    const { data: insertedMessages, error: insertError } = await supabase
      .from('chat_messages')
      .insert([
        {
          user_id: user.id,
          session_id: session.id,
          role: 'user',
          content: query.trim(),
          summary_block: null,
          referenced_sources: [],
          tags: [],
        },
        {
          user_id: user.id,
          session_id: session.id,
          role: 'model',
          content: aiResponse.answer,
          summary_block: aiResponse.summaryBlock ?? null,
          referenced_sources: aiResponse.referencedSources ?? [],
          tags: aiResponse.tags ?? [],
        },
      ])
      .select('*');

    if (insertError || !insertedMessages || insertedMessages.length < 2) {
      throw insertError ?? new Error('Failed to persist chat messages.');
    }

    await touchChatSession(supabase, session.id, buildChatSessionTitle(query), lastMessageAt);

    const [userMessage, modelMessage] = insertedMessages.map(mapChatMessage);

    return apiSuccess(
      {
        userMessage,
        modelMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    logApiEvent('error', 'chat.legacy.send.failed', {
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
    return handleApiRouteError(error, 'chat.legacy.send');
  }
}

function readOptionalItemIds(value: unknown) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ApiRouteError(400, 'itemIds must be an array of ids.', {
      code: 'validation_error',
    });
  }

  return value.slice(0, 40).map((entry) => readUuid(entry, 'itemIds entry'));
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { error } = await supabase.from('chat_sessions').delete().eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return apiSuccess({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    return handleApiRouteError(error, 'chat.legacy.clear');
  }
}
