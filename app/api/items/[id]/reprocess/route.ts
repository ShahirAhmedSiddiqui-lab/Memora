import { NextRequest } from 'next/server';
import { apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { readUuid } from '@/lib/api/validation';
import { retryItemProcessing } from '@/lib/vault/ingestion';
import { createClient } from '@/lib/supabase/server';
import { mapKnowledgeItem, VAULT_BUCKET } from '@/lib/supabase/vault';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    enforceRateLimit({
      key: `items:reprocess:${user.id}`,
      limit: 6,
      windowMs: 60_000,
      message: 'Too many reprocess attempts. Please wait a minute and try again.',
      code: 'item_reprocess_rate_limited',
    });

    const { id } = await params;
    const itemId = readUuid(id, 'Item id');
    const item = await retryItemProcessing(supabase, user.id, itemId);

    let signedUrl: string | undefined;
    if (item.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(item.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess(mapKnowledgeItem(item, signedUrl));
  } catch (error) {
    return handleApiRouteError(error, 'items.reprocess');
  }
}
