import { NextRequest, NextResponse } from 'next/server';
import { askSecondBrain } from '@/lib/gemini';
import { createClient } from '@/lib/supabase/server';
import { mapChatMessage, mapKnowledgeItem } from '@/lib/supabase/vault';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json((data ?? []).map(mapChatMessage));
  } catch (error) {
    console.error('Failed to get chats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, persist = true } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const [{ data: existingChats, error: chatError }, { data: itemRows, error: itemError }] = await Promise.all([
      supabase.from('chat_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase
        .from('knowledge_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('processing_status', 'ready')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
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

    const aiResponse = await askSecondBrain(query, items, formattedHistory);

    if (!persist) {
      const createdAt = new Date().toISOString();
      return NextResponse.json(
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
            createdAtDate: createdAt,
          },
        },
        { status: 201 }
      );
    }

    const { data: insertedMessages, error: insertError } = await supabase
      .from('chat_messages')
      .insert([
        {
          user_id: user.id,
          role: 'user',
          content: query,
          summary_block: null,
          referenced_sources: [],
          tags: [],
        },
        {
          user_id: user.id,
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

    const [userMessage, modelMessage] = insertedMessages.map(mapChatMessage);

    return NextResponse.json(
      {
        userMessage,
        modelMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to send message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase.from('chat_messages').delete().eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    console.error('Failed to clear chats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
