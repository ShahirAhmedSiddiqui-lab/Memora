import { redirect } from 'next/navigation';
import { LockKeyhole, UserRound } from 'lucide-react';
import { BrandLockup } from '../_components/brand-lockup';
import { createClient } from '@/lib/supabase/server';
import { getSafeUser } from '@/lib/supabase/auth';
import { LoginFormClient } from './login-form-client';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createClient();
  const { user } = await getSafeUser(supabase);

  if (user) {
    redirect('/vault');
  }

  const { message } = await searchParams;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f7f7f3,_#ffffff_55%)] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <section className="max-w-xl space-y-6">
          <div className="inline-flex rounded-[26px] border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm">
            <BrandLockup size="sm" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tight text-neutral-950 sm:text-5xl">
              Sign in to your private second brain.
            </h1>
            <p className="max-w-lg text-sm leading-7 text-neutral-600 sm:text-base">
              Your notes, PDFs, screenshots, voice memos, and AI summaries now live in Supabase with
              per-user auth and private storage.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <LockKeyhole className="mb-3 h-5 w-5 text-neutral-900" />
              <h2 className="text-sm font-bold text-neutral-950">Protected sessions</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Only authenticated users can read, upload, or delete their vault data.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <UserRound className="mb-3 h-5 w-5 text-neutral-900" />
              <h2 className="text-sm font-bold text-neutral-950">Private file storage</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                PDFs, screenshots, and audio uploads are stored in a user-scoped Supabase bucket instead
                of local JSON.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 w-full max-w-md rounded-[28px] border border-neutral-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:mt-0">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-neutral-400">Account Access</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-950">Login or create an account</h2>
          </div>

          <LoginFormClient initialMessage={message} />
        </section>
      </div>
    </main>
  );
}
