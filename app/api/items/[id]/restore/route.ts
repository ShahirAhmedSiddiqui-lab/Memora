import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapKnowledgeItem, VAULT_BUCKET } from '@/lib/supabase/vault';
import { getRestoredStatus } from '@/lib/vault/items';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: trashedItem, error } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .single();

    if (error || !trashedItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { data: restoredItem, error: restoreError } = await supabase
      .from('knowledge_items')
      .update({
        deleted_at: null,
        processing_status: getRestoredStatus({
          failureReason: trashedItem.failure_reason,
          summary: trashedItem.summary,
        }),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (restoreError || !restoredItem) {
      return NextResponse.json({ error: 'Failed to restore item' }, { status: 500 });
    }

    let signedUrl: string | undefined;
    if (restoredItem.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(restoredItem.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return NextResponse.json(mapKnowledgeItem(restoredItem, signedUrl));
  } catch (error) {
    console.error('Failed to restore item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
