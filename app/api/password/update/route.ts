import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { ApiRouteError, apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { ensureObject, readJsonBody, readRequiredString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await requireApiUser(supabase);

    enforceRateLimit({
      key: `auth:password-update:${user.id}:${getClientIp(req)}`,
      limit: 5,
      windowMs: 60_000,
      message: 'Too many password change attempts. Please wait a minute and try again.',
      code: 'password_update_rate_limited',
    });

    const body = ensureObject(await readJsonBody(req));
    const normalizedCurrentPassword = readRequiredString(body.currentPassword, {
      field: 'Current password',
      minLength: 1,
      maxLength: 1024,
      trim: false,
    });
    const normalizedPassword = readRequiredString(body.password, {
      field: 'Password',
      minLength: 6,
      maxLength: 1024,
      trim: false,
    });

    if (!user.email) {
      throw new ApiRouteError(400, 'This account does not have a password email identity.', {
        code: 'password_identity_missing',
      });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
      throw new ApiRouteError(500, 'Missing Supabase environment variables.', {
        code: 'missing_environment',
      });
    }

    // Verify the current password with an isolated client so we don't disturb the
    // active authenticated session that will be used for the actual password update.
    const verificationClient = createSupabaseClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error: signInError } = await verificationClient.auth.signInWithPassword({
      email: user.email,
      password: normalizedCurrentPassword,
    });

    if (signInError) {
      throw new ApiRouteError(400, 'Current password is incorrect.', {
        code: 'incorrect_current_password',
      });
    }

    await verificationClient.auth.signOut();

    const { error } = await supabase.auth.updateUser({
      password: normalizedPassword,
    });

    if (error) {
      throw new ApiRouteError(400, error.message, {
        code: 'password_update_failed',
      });
    }

    return apiSuccess({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    return handleApiRouteError(error, 'auth.password_update');
  }
}
