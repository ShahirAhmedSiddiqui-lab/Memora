import Link from 'next/link';
import { ArrowRight, Layers, Settings2, Sparkles } from 'lucide-react';
import { redirect } from 'next/navigation';
import { BrandLockup } from '../_components/brand-lockup';
import { createClient } from '@/lib/supabase/server';
import { getSafeUser } from '@/lib/supabase/auth';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { user } = await getSafeUser(supabase);

  if (!user) {
    redirect('/login?message=Please%20log%20in%20to%20continue%20to%20onboarding.');
  }

  const firstName = user.email?.split('@')[0] || 'there';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f8f5ef,_#fbfbfd_50%,_#ffffff_100%)] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10">
        <div className="rounded-[32px] border border-neutral-200 bg-white/95 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
          <div className="flex flex-col gap-8">
            <div className="space-y-4">
              <BrandLockup size="sm" />
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">First-Time Setup</p>
                <h1 className="text-4xl font-black tracking-tight text-neutral-950">
                  Welcome, {firstName}. Your vault is ready.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-neutral-600 sm:text-base">
                  Memora is set up with private storage, grounded search, and capture workflows. Use this
                  page as your first stop before jumping into the vault.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
                <Sparkles className="h-5 w-5 text-neutral-900" />
                <h2 className="mt-4 text-lg font-bold text-neutral-950">Tune your preferences</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Review voice speed, response detail, motion, and compact mode before you start saving content.
                </p>
                <Link
                  href="/settings"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-neutral-900 hover:underline"
                >
                  Open settings
                  <Settings2 className="h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
                <Layers className="h-5 w-5 text-neutral-900" />
                <h2 className="mt-4 text-lg font-bold text-neutral-950">Start using your vault</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Save your first link, PDF, screenshot, voice note, or article and let the workspace generate structured recall.
                </p>
                <Link
                  href="/vault"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-neutral-900 hover:underline"
                >
                  Go to vault
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
