import { NextRequest, NextResponse } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { apiSuccess, handleApiRouteError } from '@/lib/api/errors';
import {
  buildPendingSignupCookieValue,
  getPendingSignupCookieOptions,
  PENDING_SIGNUP_COOKIE,
} from '@/lib/auth/pending-signup';
import { logApiEvent } from '@/lib/api/logging';
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { ensureObject, readEmail, readJsonBody, readOptionalString, readRequiredString } from '@/lib/api/validation';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_EMAIL_CONFIRMATION_REDIRECT_URL } from '@/lib/supabase/auth-redirects';

function isExistingSignupAttempt(user: User | null) {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = ensureObject(await readJsonBody(req));
    const normalizedEmail = readEmail(body.email, 'Email');
    const normalizedPassword = readRequiredString(body.password, {
      field: 'Password',
      minLength: 6,
      maxLength: 1024,
      trim: false,
    });
    const normalizedName =
      readOptionalString(body.fullName ?? body.name, {
        field: 'Full name',
        maxLength: 80,
      })?.replace(/\s+/g, ' ') ?? '';
    const ip = getClientIp(req);

    enforceRateLimit({
      key: `auth:signup:${ip}:${normalizedEmail}`,
      limit: 3,
      windowMs: 60_000,
      message: 'Too many signup attempts. Please wait a minute and try again.',
      code: 'signup_rate_limited',
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
      options: {
        emailRedirectTo: SUPABASE_EMAIL_CONFIRMATION_REDIRECT_URL,
        data: {
          full_name: normalizedName || undefined,
          name: normalizedName || undefined,
        },
      },
    });

    if (error) {
      logApiEvent('warn', 'auth.signup.rejected', {
        ip,
        code: 'signup_failed',
      });
      const response = apiSuccess({
        success: true,
        requiresEmailConfirmation: true,
        message: 'If this email can be used for signup, check your inbox for the next step. If you already have an account, try logging in.',
        user: null,
      });
      response.cookies.set(
        PENDING_SIGNUP_COOKIE,
        buildPendingSignupCookieValue(normalizedEmail),
        getPendingSignupCookieOptions()
      );
      return response;
    }

    if (isExistingSignupAttempt(data.user)) {
      const response = apiSuccess({
        success: true,
        requiresEmailConfirmation: true,
        message: 'If this email can be used for signup, check your inbox for the next step. If you already have an account, try logging in.',
        user: null,
      });
      response.cookies.set(
        PENDING_SIGNUP_COOKIE,
        buildPendingSignupCookieValue(normalizedEmail),
        getPendingSignupCookieOptions()
      );
      return response;
    }

    const response = apiSuccess({
      success: true,
      requiresEmailConfirmation: !data.session,
      message: data.session
        ? 'Account created successfully.'
        : 'Account created. Check your email to confirm your signup, then log in.',
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email ?? normalizedEmail,
          }
        : null,
    });
    if (!data.session) {
      response.cookies.set(
        PENDING_SIGNUP_COOKIE,
        buildPendingSignupCookieValue(normalizedEmail),
        getPendingSignupCookieOptions()
      );
    }
    return response;
  } catch (error) {
    return handleApiRouteError(error, 'auth.signup', {
      ip: getClientIp(req),
    });
  }
}
