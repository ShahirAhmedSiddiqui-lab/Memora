import { NextRequest } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { readUuid } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { mapKnowledgeItem, VAULT_BUCKET } from '@/lib/supabase/vault';
import { getRestoredStatus } from '@/lib/vault/items';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { id } = await params;
    const itemId = readUuid(id, 'Item id');

    const { data: trashedItem, error } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .single();

    if (error || !trashedItem) {
      throw new ApiRouteError(404, 'Item not found', { code: 'not_found' });
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
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (restoreError || !restoredItem) {
      throw new ApiRouteError(500, 'Failed to restore item', {
        code: 'restore_failed',
        cause: restoreError,
      });
    }

    let signedUrl: string | undefined;
    if (restoredItem.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(restoredItem.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess(mapKnowledgeItem(restoredItem, signedUrl));
  } catch (error) {
    return handleApiRouteError(error, 'items.restore');
  }
}
