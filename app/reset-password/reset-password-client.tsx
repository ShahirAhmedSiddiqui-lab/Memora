'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import { BrandLockup } from '@/app/_components/brand-lockup';
import { PasswordInput } from '@/app/_components/password-input';
import { createClient } from '@/lib/supabase/client';

export function ResetPasswordClient() {
  const router = useRouter();
  const [mode, setMode] = React.useState<'request' | 'update'>('request');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();

    const bootstrap = async () => {
      const hash = window.location.hash.toLowerCase();
      const search = new URLSearchParams(window.location.search);
      const tokenHash = search.get('token_hash');
      const type = search.get('type');
      const code = search.get('code');

      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'recovery' | 'email' | 'signup' | 'invite' | 'email_change' | 'magiclink',
        });

        if (verifyError) {
          setError('This reset link is invalid or has expired. Request a fresh one and try again.');
          return;
        }

        setMode('update');
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError('This reset link is invalid or has expired. Request a fresh one and try again.');
          return;
        }

        setMode('update');
        return;
      }

      if (hash.includes('type=recovery')) {
        setMode('update');
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setMode('update');
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setMode('update');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const requestResetEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to send reset email.');
      }

      setFeedback(data.message || 'If that account exists, a reset email has been sent.');
    } catch (requestError) {
      console.error(requestError);
      setError(requestError instanceof Error ? requestError.message : 'Unable to send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);

    if (!password || !confirmPassword) {
      setError('Enter your new password twice to continue.');
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();
      setFeedback('Password updated successfully. Redirecting to login...');
      window.setTimeout(() => {
        router.replace('/login?message=Password%20updated%20successfully.%20Please%20log%20in%20with%20your%20new%20password.');
      }, 900);
    } catch (updateError) {
      console.error(updateError);
      setError(updateError instanceof Error ? updateError.message : 'Unable to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f7f3,_#ffffff_55%)] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-xl rounded-[30px] border border-neutral-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <BrandLockup size="sm" />
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Login
            </Link>
          </div>

          <div className="mt-8 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">
              {mode === 'request' ? 'Request Reset' : 'Set New Password'}
            </p>
            <h1 className="text-3xl font-black tracking-tight text-neutral-950">
              {mode === 'request' ? 'Recover access to your vault.' : 'Choose a new password.'}
            </h1>
            <p className="text-sm leading-7 text-neutral-600">
              {mode === 'request'
                ? 'Enter your email and we will send you a secure recovery link.'
                : 'Finish the recovery flow by setting a fresh password for your Memora account. After saving, we will send you back to login.'}
            </p>
          </div>

          <form onSubmit={mode === 'request' ? requestResetEmail : updatePassword} className="mt-8 space-y-4">
            {mode === 'request' ? (
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white"
                  placeholder="you@example.com"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
                    New Password
                  </label>
                  <PasswordInput id="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
                    Confirm Password
                  </label>
                  <PasswordInput id="confirmPassword" required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your new password" />
                </div>
              </>
            )}

            {(feedback || error) && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {error || feedback}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
              {mode === 'request' ? 'Send reset link' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
