import { after, NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { logApiEvent } from '@/lib/api/logging';
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit';
import {
  ensureObject,
  readJsonBody,
  readOptionalString,
} from '@/lib/api/validation';
import { createPendingItem, processPendingItem } from '@/lib/vault/ingestion';
import { createClient } from '@/lib/supabase/server';
import { attachSignedUrls, mapKnowledgeItem, matchesSearch, VAULT_BUCKET } from '@/lib/supabase/vault';
import { coerceUploadedFileData } from '@/lib/vault/uploads';

const ALLOWED_ITEM_TYPES = ['Videos', 'Articles', 'PDFs', 'Social Links', 'Voice Notes', 'Images'] as const;
const ALLOWED_PROCESSING_STATUSES = ['pending', 'ready', 'failed', 'trashed'] as const;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const search = searchParams.get('q')?.trim();
    const includeTrashed = searchParams.get('include_trashed') === 'true';

    if (type && type !== 'All Knowledge' && !ALLOWED_ITEM_TYPES.includes(type as (typeof ALLOWED_ITEM_TYPES)[number])) {
      throw new ApiRouteError(400, 'type is invalid.', {
        code: 'validation_error',
      });
    }

    if (status && !ALLOWED_PROCESSING_STATUSES.includes(status as (typeof ALLOWED_PROCESSING_STATUSES)[number])) {
      throw new ApiRouteError(400, 'status is invalid.', {
        code: 'validation_error',
      });
    }

    if (search && search.length > 200) {
      throw new ApiRouteError(400, 'Search query must be 200 characters or fewer.', {
        code: 'validation_error',
      });
    }

    let query = supabase
      .from('knowledge_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (type && type !== 'All Knowledge') {
      query = query.eq('item_type', type);
    }

    if (status) {
      query = query.eq('processing_status', status);
    } else if (!includeTrashed) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    let items = await attachSignedUrls(supabase, data ?? []);

    if (search) {
      items = items.filter((item) => matchesSearch(item, search));
    }

    return apiSuccess(items);
  } catch (error) {
    return handleApiRouteError(error, 'items.list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    enforceRateLimit({
      key: `items:create:${user.id}`,
      limit: 12,
      windowMs: 60_000,
      message: 'Too many item captures. Please wait a minute and try again.',
      code: 'item_create_rate_limited',
    });

    const body = ensureObject(await readJsonBody(req));
    const url = readOptionalString(body.url, {
      field: 'URL',
      maxLength: 2048,
    });
    const content = readOptionalString(body.content, {
      field: 'Content',
      maxLength: 20_000,
    });
    const requestedType: (typeof ALLOWED_ITEM_TYPES)[number] | undefined = body.type
      ? (() => {
          const value = String(body.type).trim();
          if (!ALLOWED_ITEM_TYPES.includes(value as (typeof ALLOWED_ITEM_TYPES)[number])) {
            throw new ApiRouteError(400, 'type is invalid.', { code: 'validation_error' });
          }
          return value as (typeof ALLOWED_ITEM_TYPES)[number];
        })()
      : undefined;
    const fileData = coerceUploadedFileData(body.fileData);

    if (!content && !url && !fileData) {
      throw new ApiRouteError(400, 'Content, URL or file is required.', {
        code: 'validation_error',
      });
    }

    const item = await createPendingItem(supabase, user.id, {
      url,
      content,
      requestedType,
      fileData,
    });

    if (item.processing_status === 'pending') {
      after(async () => {
        try {
          await processPendingItem(supabase, user.id, item.id);
        } catch (processingError) {
          logApiEvent('error', 'ingestion.background_process.failed', {
            itemId: item.id,
            userId: user.id,
            cause: processingError instanceof Error ? processingError.message : 'Unknown error',
          });
        }
      });
    }

    let signedUrl: string | undefined;
    if (item.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(item.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return apiSuccess(mapKnowledgeItem(item, signedUrl), { status: 201 });
  } catch (error) {
    return handleApiRouteError(error, 'items.create', {
      ip: getClientIp(req),
    });
  }
}
