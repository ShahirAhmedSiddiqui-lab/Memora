import { NextRequest } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { ensureObject, readJsonBody, readOptionalBoolean, readUuid } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { mapKnowledgeItem, VAULT_BUCKET } from '@/lib/supabase/vault';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { id } = await params;
    const itemId = readUuid(id, 'Item id');

    const { data: item, error } = await supabase
      .from('knowledge_items')
      .select('*')
      .eq('id', itemId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (error || !item) {
      throw new ApiRouteError(404, 'Item not found', { code: 'not_found' });
    }

    let signedUrl: string | undefined;
    if (item.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(item.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess(mapKnowledgeItem(item, signedUrl));
  } catch (error) {
    return handleApiRouteError(error, 'items.get');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { id } = await params;
    const itemId = readUuid(id, 'Item id');
    const body = ensureObject(await readJsonBody(req));
    const updates: Record<string, unknown> = {};

    const bookmarked = readOptionalBoolean(body.bookmarked, 'bookmarked');
    if (bookmarked !== undefined) {
      updates.bookmarked = bookmarked;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiRouteError(400, 'No supported updates provided', { code: 'validation_error' });
    }

    const { data: item, error } = await supabase
      .from('knowledge_items')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !item) {
      throw new ApiRouteError(404, 'Item not found', { code: 'not_found' });
    }

    let signedUrl: string | undefined;
    if (item.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(item.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess(mapKnowledgeItem(item, signedUrl));
  } catch (error) {
    return handleApiRouteError(error, 'items.update');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { id } = await params;
    const itemId = readUuid(id, 'Item id');
    const permanentDelete = req.nextUrl.searchParams.get('permanent') === 'true';

    if (permanentDelete) {
      const { data: existingItem, error: fetchError } = await supabase
        .from('knowledge_items')
        .select('*')
        .eq('id', itemId)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null)
        .single();

      if (fetchError || !existingItem) {
        throw new ApiRouteError(404, 'Trashed item not found', { code: 'not_found' });
      }

      if (existingItem.file_path) {
        const { error: storageError } = await supabase.storage.from(VAULT_BUCKET).remove([existingItem.file_path]);

        if (storageError) {
          console.error('Failed to remove file from storage:', storageError);
        }
      }

      const { error: deleteError } = await supabase
        .from('knowledge_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', user.id)
        .not('deleted_at', 'is', null);

      if (deleteError) {
        throw new ApiRouteError(500, 'Failed to permanently delete item', {
          code: 'delete_failed',
          cause: deleteError,
        });
      }

      const { error: fileDeleteError } = await supabase
        .from('vault_files')
        .delete()
        .eq('item_id', itemId)
        .eq('user_id', user.id);

      if (fileDeleteError) {
        throw new ApiRouteError(500, 'Failed to remove file metadata for this item', {
          code: 'delete_failed',
          cause: fileDeleteError,
        });
      }

      return apiSuccess({
        success: true,
        message: 'Item permanently deleted',
        deletedId: itemId,
      });
    }

    const deletedAt = new Date().toISOString();

    const { data: deletedItem, error } = await supabase
      .from('knowledge_items')
      .update({
        processing_status: 'trashed',
        deleted_at: deletedAt,
      })
      .eq('id', itemId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !deletedItem) {
      throw new ApiRouteError(404, 'Item not found', { code: 'not_found' });
    }

    let signedUrl: string | undefined;
    if (deletedItem.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(deletedItem.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess({
      success: true,
      message: 'Item moved to trash successfully',
      item: mapKnowledgeItem(deletedItem, signedUrl),
    });
  } catch (error) {
    return handleApiRouteError(error, 'items.delete');
  }
}
