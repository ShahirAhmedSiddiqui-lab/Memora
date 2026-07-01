import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { ensureObject, readJsonBody, readRequiredString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = ensureObject(await readJsonBody(req));
    const fingerprint = readRequiredString(body.fingerprint, {
      field: 'Fingerprint',
      minLength: 1,
      maxLength: 4096,
      trim: false,
    });
    const linkType = readRequiredString(body.linkType, {
      field: 'Link type',
      minLength: 1,
      maxLength: 32,
    });
    const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : 'claim';

    if (linkType !== 'confirmation' && linkType !== 'recovery') {
      throw new ApiRouteError(400, 'Link type is invalid.', {
        code: 'validation_error',
      });
    }

    if (mode !== 'claim' && mode !== 'check') {
      throw new ApiRouteError(400, 'Claim mode is invalid.', {
        code: 'validation_error',
      });
    }

    const supabase = await createClient();
    const hashedFingerprint = createHash('sha256').update(fingerprint).digest('hex');

    if (mode === 'check') {
      const { data, error } = await supabase
        .from('auth_link_consumption')
        .select('link_hash')
        .eq('link_hash', hashedFingerprint)
        .eq('link_type', linkType)
        .maybeSingle();

      if (error) {
        throw new ApiRouteError(500, 'Unable to validate auth link right now.', {
          code: 'auth_link_check_failed',
          cause: error,
        });
      }

      return apiSuccess({
        claimed: Boolean(data),
      });
    }

    const { error } = await supabase.from('auth_link_consumption').insert({
      link_hash: hashedFingerprint,
      link_type: linkType,
    });

    if (error) {
      if (error.code === '23505') {
        return apiSuccess({
          claimed: false,
        });
      }

      throw new ApiRouteError(500, 'Unable to validate auth link right now.', {
        code: 'auth_link_claim_failed',
        cause: error,
      });
    }

    return apiSuccess({
      claimed: true,
    });
  } catch (error) {
    return handleApiRouteError(error, 'auth.claim_link');
  }
}
