import { NextRequest, NextResponse } from 'next/server';
import { apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import { getClearedPendingSignupCookieOptions, PENDING_SIGNUP_COOKIE } from '@/lib/auth/pending-signup';
import { logApiEvent } from '@/lib/api/logging';
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { ensureObject, readEmail, readJsonBody, readRequiredString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = ensureObject(await readJsonBody(req));
    const normalizedEmail = readEmail(body.email, 'Email');
    const normalizedPassword = readRequiredString(body.password, {
      field: 'Password',
      minLength: 1,
      maxLength: 1024,
      trim: false,
    });
    const ip = getClientIp(req);

    enforceRateLimit({
      key: `auth:login:${ip}:${normalizedEmail}`,
      limit: 5,
      windowMs: 60_000,
      message: 'Too many login attempts. Please wait a minute and try again.',
      code: 'login_rate_limited',
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (error) {
      logApiEvent('warn', 'auth.login.rejected', {
        ip,
        status: 400,
        code: 'invalid_login_attempt',
      });

      return NextResponse.json(
        {
          error: 'Unable to log in with the provided credentials.',
          code: 'invalid_login',
        },
        { status: 400 }
      );
    }

    const response = apiSuccess({
      success: true,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email ?? normalizedEmail,
          }
        : null,
    });
    response.cookies.set(PENDING_SIGNUP_COOKIE, '', getClearedPendingSignupCookieOptions());
    return response;
  } catch (error) {
    return handleApiRouteError(error, 'auth.login', {
      ip: getClientIp(req),
    });
  }
}
