export const SUPABASE_EMAIL_CONFIRMATION_REDIRECT_URL = 'https://usememoraweb.vercel.app/auth/callback';

export const SUPABASE_PASSWORD_RESET_REDIRECT_URL = 'https://usememoraweb.vercel.app/update-password';

export const SUPABASE_LOCAL_REDIRECT_URLS = [
  'http://localhost:3000/login',
  'http://localhost:3000/sign-up',
  'http://localhost:3000/forgot-password',
  'http://localhost:3000/update-password',
  'http://localhost:3000/reset-password',
  'http://localhost:3000/auth/callback',
] as const;
