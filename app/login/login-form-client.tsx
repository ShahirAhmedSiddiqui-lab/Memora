'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCcw } from 'lucide-react';
import { PasswordInput } from '@/app/_components/password-input';

type LoginFormClientProps = {
  initialMessage?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAuthMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed') || normalized.includes('email not confirmed yet')) {
    return 'Confirm your email before logging in. Check your inbox for the verification message.';
  }

  return message;
}

export function LoginFormClient({ initialMessage }: LoginFormClientProps) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(initialMessage ?? null);
  const [messageTone, setMessageTone] = React.useState<'error' | 'success'>(initialMessage ? 'success' : 'error');
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [isSigningUp, setIsSigningUp] = React.useState(false);
  const [isSendingReset, setIsSendingReset] = React.useState(false);

  const showError = React.useCallback((nextMessage: string) => {
    setMessage(normalizeAuthMessage(nextMessage));
    setMessageTone('error');
  }, []);

  const showSuccess = React.useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    setMessageTone('success');
  }, []);

  const handleLogin = async () => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password;

    if (!normalizedEmail || !normalizedPassword) {
      showError('Email and password are required.');
      return;
    }

    setIsLoggingIn(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: normalizedPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to log in.');
      }

      router.replace('/vault');
      router.refresh();
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Unable to log in.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async () => {
    const normalizedEmail = email.trim();
    const normalizedName = name.trim();

    if (!normalizedEmail || !password) {
      showError('Email and password are required.');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters long.');
      return;
    }

    setIsSigningUp(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: normalizedName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to create account.');
      }

      if (data.requiresEmailConfirmation) {
        setName('');
        setEmail('');
        setPassword('');
        showSuccess(data.message || 'Account created. Check your email to confirm your signup, then log in.');
        return;
      }

      setName('');
      setEmail('');
      setPassword('');
      router.replace('/vault');
      router.refresh();
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      router.push('/reset-password');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      showError('Enter a valid email before requesting a reset link.');
      return;
    }

    setIsSendingReset(true);
    setMessage(null);

    try {
      const response = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to send reset email.');
      }

      showSuccess(data.message || 'If that account exists, a password reset email has been sent.');
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : 'Unable to send reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div>
      {message ? (
        <div
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            messageTone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message}
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleLogin();
        }}
      >
        <div className="space-y-2">
          <label htmlFor="name" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Memora User"
            autoComplete="name"
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.24em] text-neutral-400">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Minimum 6 characters"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleForgotPassword()}
            disabled={isSendingReset}
            className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500 transition hover:text-neutral-950 disabled:opacity-50"
          >
            {isSendingReset ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : null}
            Forgot your password?
          </button>
        </div>

        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <button
            type="submit"
            disabled={isLoggingIn || isSigningUp || isSendingReset}
            className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {isLoggingIn ? 'Logging in...' : 'Log In'}
          </button>
          <button
            type="button"
            onClick={() => void handleSignup()}
            disabled={isLoggingIn || isSigningUp || isSendingReset}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-900 transition hover:border-neutral-900 disabled:opacity-50"
          >
            {isSigningUp ? 'Creating account...' : 'Sign Up'}
          </button>
        </div>

        {!email.trim() ? (
          <p className="text-xs leading-6 text-neutral-500">
            No email entered yet.
            {' '}
            <Link href="/reset-password" className="font-semibold text-neutral-700 transition hover:text-neutral-950">
              Open the reset page instead.
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  );
}
