'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BrandLockup } from '@/app/_components/brand-lockup';
import { PasswordInput } from '@/app/_components/password-input';
import { broadcastAuthLinkEvent } from '@/lib/auth-link-events';
import { queueFlashToast } from '@/lib/client/flash-toast';
import { createClient } from '@/lib/supabase/client';

type ResetPasswordClientProps = {
  entryMode?: 'auto' | 'request' | 'update';
};

function getResetLinkFingerprint() {
  if (typeof window === 'undefined') {
    return '';
  }

  const search = window.location.search;
  const hash = window.location.hash;

  if (!search && !hash) {
    return '';
  }

  return `${window.location.pathname}${search}${hash}`;
}

async function markAuthLinkConsumed(fingerprint: string, linkType: 'confirmation' | 'recovery') {
  const response = await fetch('/api/claim-auth-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fingerprint,
      linkType,
    }),
  });

  if (!response.ok) {
    return false;
  }

  return true;
}

async function ensureRecoverySession(supabase: ReturnType<typeof createClient>) {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export function ResetPasswordClient({ entryMode = 'auto' }: ResetPasswordClientProps) {
  const [mode, setMode] = React.useState<'request' | 'redeem' | 'update'>(entryMode === 'update' ? 'redeem' : 'request');
  const [isRecoveryFlow, setIsRecoveryFlow] = React.useState(false);
  const [hasCompleted, setHasCompleted] = React.useState(false);
  const [isRedeemingLink, setIsRedeemingLink] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();

    const bootstrap = async () => {
      const shouldPreferUpdateFlow = entryMode === 'update';
      const hash = window.location.hash.toLowerCase();
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const search = new URLSearchParams(window.location.search);
      const tokenHash = search.get('token_hash');
      const type = search.get('type');
      const code = search.get('code');
      const hashType = hashParams.get('type');
      const hasRecoveryHashSession = hashType === 'recovery' && !!hashParams.get('access_token');
      const errorCode = search.get('error_code');
      const errorDescription = search.get('error_description');

      if (errorCode || errorDescription || hash.includes('error=')) {
        setMode('request');
        setIsRecoveryFlow(false);
        setError('This reset link has expired. Request a new one to continue.');
        return;
      }

      if (hasRecoveryHashSession) {
        try {
          const session = await ensureRecoverySession(supabase);
          if (session) {
            setError(null);
            setMode('update');
            setIsRecoveryFlow(true);
            return;
          }
        } catch (sessionError) {
          console.error(sessionError);
        }

        setError(null);
        setMode('redeem');
        setIsRecoveryFlow(true);
        return;
      }

      if ((tokenHash && type) || code) {
        setError(null);
        setMode('redeem');
        setIsRecoveryFlow(true);
        return;
      }

      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      if (existingSession) {
        setError(null);
        setMode(shouldPreferUpdateFlow ? 'update' : 'request');
        setIsRecoveryFlow(false);
        return;
      }

      if ((tokenHash && type) || code || hash.includes('type=recovery')) {
        setMode('request');
        setIsRecoveryFlow(false);
        setError('This reset link has expired. Request a new one to continue.');
        return;
      }

      if (shouldPreferUpdateFlow) {
        setMode('request');
        setIsRecoveryFlow(false);
        setError('Open the password reset link from your email to set a new password.');
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setError(null);
        setMode('update');
        setIsRecoveryFlow(event === 'PASSWORD_RECOVERY');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [entryMode]);

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

      toast.success(data.message || 'If that account exists, a reset email has been sent.');
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

    if (!password || !confirmPassword || (!isRecoveryFlow && !currentPassword)) {
      setError(
        isRecoveryFlow
          ? 'Enter your new password twice to continue.'
          : 'Current password and your new password are required.'
      );
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
      if (!isRecoveryFlow && currentPassword) {
        const response = await fetch('/api/password/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword,
            password,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to update password.');
        }
      } else {
        const session = await ensureRecoverySession(supabase);

        if (!session) {
          throw new Error('Your reset session is missing or expired. Open the latest reset email again and retry.');
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          throw updateError;
        }
      }

      await supabase.auth.signOut();
      queueFlashToast({ message: 'Password changed successfully. Please log in with your new password.' });
      broadcastAuthLinkEvent({
        type: 'password_reset_completed',
        message: 'Password changed successfully. Please log in again with your new password.',
        issuedAt: Date.now(),
      });
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setHasCompleted(true);
      toast.success('Password changed successfully.');
      setFeedback('Password changed successfully. You can now close this tab and continue from the previous Memora tab.');
    } catch (updateError) {
      console.error(updateError);
      setError(updateError instanceof Error ? updateError.message : 'Unable to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const redeemRecoveryLink = async () => {
    setIsRedeemingLink(true);
    setFeedback(null);
    setError(null);

    try {
      const supabase = createClient();
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.slice(1));
      const search = new URLSearchParams(window.location.search);
      const tokenHash = search.get('token_hash');
      const type = search.get('type');
      const code = search.get('code');
      const hashType = hashParams.get('type');
      const hasRecoveryHashSession = hashType === 'recovery' && !!hashParams.get('access_token');

      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'recovery' | 'email' | 'signup' | 'invite' | 'email_change' | 'magiclink',
        });

        if (verifyError) {
          setMode('request');
          setIsRecoveryFlow(false);
          setError('This reset link has expired. Request a new one to continue.');
          return;
        }
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setMode('request');
          setIsRecoveryFlow(false);
          setError('This reset link has expired. Request a new one to continue.');
          return;
        }
      } else if (!hasRecoveryHashSession) {
        setMode('request');
        setIsRecoveryFlow(false);
        setError('This reset link has expired. Request a new one to continue.');
        return;
      }

      const session = await ensureRecoverySession(supabase);

      if (!session) {
        setMode('request');
        setIsRecoveryFlow(false);
        setError('This reset link could not start a secure recovery session. Open the latest reset email and try again.');
        return;
      }

      const linkFingerprint = getResetLinkFingerprint();
      if (linkFingerprint) {
        void markAuthLinkConsumed(linkFingerprint, 'recovery');
      }

      setMode('update');
      setIsRecoveryFlow(true);
      window.history.replaceState({}, document.title, '/update-password');
    } catch (redeemError) {
      console.error(redeemError);
      setMode('request');
      setIsRecoveryFlow(false);
      setError('This reset link has expired. Request a new one to continue.');
    } finally {
      setIsRedeemingLink(false);
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
              {hasCompleted
                ? 'Password updated.'
                : mode === 'request'
                  ? entryMode === 'update'
                    ? 'Open your reset link to continue.'
                    : 'Recover access to your vault.'
                  : 'Choose a new password.'}
            </h1>
            <p className="text-sm leading-7 text-neutral-600">
              {hasCompleted
                ? 'Your password has been changed successfully. Close this tab and go back to the previous Memora tab to log in again with your new password.'
                : mode === 'request'
                ? entryMode === 'update'
                  ? 'This page is for setting a new password after opening the secure recovery link from your email. If you still need a link, request one below.'
                  : 'Enter your email and we will send you a secure recovery link.'
                : mode === 'redeem'
                  ? 'This tab is only for securely changing your password. Continue below to open the one-time recovery session, then set your new password.'
                : isRecoveryFlow
                  ? 'Finish the recovery flow by setting a fresh password for your Memora account.'
                  : 'Confirm your current password, choose a new one, and we will update it securely before sending you back to login.'}
            </p>
          </div>

          <form onSubmit={mode === 'request' ? requestResetEmail : updatePassword} className="mt-8 space-y-4">
            {hasCompleted ? null : mode === 'request' ? (
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
            ) : mode === 'redeem' ? (
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-sm leading-7 text-neutral-600">
                  Continue only in this newly opened tab. After your password is changed, the previous Memora tab will ask you to log in again with the new password.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="currentPassword" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
                    Current Password
                  </label>
                  <PasswordInput
                    id="currentPassword"
                    required={!isRecoveryFlow}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder={isRecoveryFlow ? 'Optional during email recovery' : 'Enter your current password'}
                    autoComplete="current-password"
                  />
                </div>

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
              type={mode === 'redeem' ? 'button' : 'submit'}
              onClick={mode === 'redeem' ? () => void redeemRecoveryLink() : undefined}
              disabled={isSubmitting || isRedeemingLink || hasCompleted}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {isSubmitting || isRedeemingLink ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
              {hasCompleted
                ? 'Password updated'
                : mode === 'request'
                  ? 'Send reset link'
                  : mode === 'redeem'
                    ? 'Continue to reset password'
                    : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
