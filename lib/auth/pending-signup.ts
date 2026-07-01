export const PENDING_SIGNUP_COOKIE = 'memora_pending_signup_email';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

export function normalizeEmailForCookie(email: string) {
  return email.trim().toLowerCase();
}

export function buildPendingSignupCookieValue(email: string) {
  return normalizeEmailForCookie(email);
}

export function isPendingSignupEmailMatch(cookieValue: string | undefined, email: string) {
  if (!cookieValue) {
    return false;
  }

  return cookieValue === normalizeEmailForCookie(email);
}

export function getPendingSignupCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export function getClearedPendingSignupCookieOptions() {
  return {
    ...getPendingSignupCookieOptions(),
    maxAge: 0,
  };
}
