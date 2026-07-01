'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw } from 'lucide-react';
import { BrandLockup } from '@/app/_components/brand-lockup';
import { broadcastAuthLinkEvent } from '@/lib/auth-link-events';
import { createClient } from '@/lib/supabase/client';

function getLinkFingerprint() {
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

async function claimAuthLink(fingerprint: string, linkType: 'confirmation' | 'recovery') {
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
    throw new Error('Unable to validate auth link right now.');
  }

  const data = await response.json();
  return Boolean(data.claimed);
}

export function AuthCallbackClient() {
  const router = useRouter();
  const [message, setMessage] = React.useState('Preparing your confirmation link...');
  const [hasCompleted, setHasCompleted] = React.useState(false);
  const [isRedeeming, setIsRedeeming] = React.useState(false);

  const completeConfirmation = React.useCallback(async (supabase: ReturnType<typeof createClient>) => {
    broadcastAuthLinkEvent({
      type: 'email_confirmed',
      message: 'Email confirmed successfully. Please log in.',
      issuedAt: Date.now(),
    });
    await supabase.auth.signOut();
    setHasCompleted(true);
    setMessage(
      'Account created successfully. You can now close this tab and log in with your credentials in the previous tab.'
    );

    window.setTimeout(() => {
      window.close();
    }, 900);
  }, []);

  const confirmEmail = React.useCallback(async () => {
    setIsRedeeming(true);

    try {
      const supabase = createClient();
      const search = new URLSearchParams(window.location.search);
      const code = search.get('code');
      const tokenHash = search.get('token_hash');
      const type = search.get('type');
      const linkFingerprint = getLinkFingerprint();

      const claimed = await claimAuthLink(linkFingerprint, 'confirmation');
      if (!claimed) {
        router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
        return;
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'signup' | 'invite' | 'recovery' | 'email' | 'email_change' | 'magiclink',
        });

        if (error) {
          router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
          return;
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
          return;
        }
      } else {
        router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
        return;
      }

      await completeConfirmation(supabase);
    } catch (error) {
      console.error('Auth callback error:', error);
      router.replace(`/login?message=${encodeURIComponent('We could not complete email confirmation. Please try again.')}`);
    } finally {
      setIsRedeeming(false);
    }
  }, [completeConfirmation, router]);

  React.useEffect(() => {
    const supabase = createClient();

    const prepareAuth = async () => {
      const hash = window.location.hash.toLowerCase();
      const search = new URLSearchParams(window.location.search);
      const code = search.get('code');
      const tokenHash = search.get('token_hash');
      const type = search.get('type');
      const errorCode = search.get('error_code');
      const errorDescription = search.get('error_description');

      try {
        if (errorCode || errorDescription || hash.includes('error=')) {
          router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
          return;
        }

        const isHandledLink = Boolean(tokenHash && type) || Boolean(code);
        if (isHandledLink) {
          setMessage('Confirming your email automatically...');
          void confirmEmail();
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          await completeConfirmation(supabase);
          return;
        }

        if (isHandledLink) {
          router.replace(`/login?message=${encodeURIComponent('This confirmation link has expired. Request a new one and try again.')}`);
          return;
        }

        setHasCompleted(true);
        setMessage(
          'Account created successfully. You can now close this tab and log in with your credentials in the previous tab.'
        );

        window.setTimeout(() => {
          window.close();
        }, 900);
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace(`/login?message=${encodeURIComponent('We could not complete email confirmation. Please try again.')}`);
      }
    };

    void prepareAuth();
  }, [completeConfirmation, confirmEmail, router]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f7f3,_#ffffff_55%)] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-md rounded-[30px] border border-neutral-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex justify-center">
            <BrandLockup size="sm" />
          </div>
          <div className="mt-8 flex justify-center">
            {hasCompleted ? null : <RefreshCcw className="h-5 w-5 animate-spin text-neutral-500" />}
          </div>
          <h1 className="mt-6 text-2xl font-black tracking-tight text-neutral-950">
            {hasCompleted ? 'Account created successfully.' : 'Confirming your account'}
          </h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">{message}</p>
          {isRedeeming && !hasCompleted ? (
            <p className="mt-6 text-xs font-mono uppercase tracking-[0.22em] text-neutral-400">Securing your session...</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
