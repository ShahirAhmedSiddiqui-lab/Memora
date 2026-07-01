import { LockKeyhole, UserRound } from 'lucide-react';
import { BrandLockup } from './brand-lockup';

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  formTitle: string;
  children: React.ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  formTitle,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-[radial-gradient(circle_at_top,_#f7f7f3,_#ffffff_55%)] text-neutral-950">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-center gap-8 px-6 py-8 sm:py-10 lg:flex-row lg:items-center lg:gap-16">
        <section className="animate-memora-fade-up max-w-xl space-y-6 lg:flex-1">
          <div className="inline-flex rounded-[26px] border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm transition-premium hover:-translate-y-0.5">
            <BrandLockup size="sm" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tight text-neutral-950 sm:text-5xl">{title}</h1>
            <p className="max-w-lg text-sm leading-7 text-neutral-600 sm:text-base">{description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-premium hover:-translate-y-1 hover:shadow-md">
              <LockKeyhole className="mb-3 h-5 w-5 text-neutral-900" />
              <h2 className="text-sm font-bold text-neutral-950">Protected sessions</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Only authenticated users can read, upload, or delete their vault data.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-premium hover:-translate-y-1 hover:shadow-md">
              <UserRound className="mb-3 h-5 w-5 text-neutral-900" />
              <h2 className="text-sm font-bold text-neutral-950">Private file storage</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                PDFs, screenshots, and audio uploads are stored in a user-scoped Supabase bucket instead
                of local JSON.
              </p>
            </div>
          </div>
        </section>

        <section className="animate-memora-fade-up [animation-delay:120ms] w-full max-w-md shrink-0 self-center rounded-[28px] border border-neutral-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:mt-0">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-neutral-400">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-950">{formTitle}</h2>
          </div>

          {children}
        </section>
      </div>
    </main>
  );
}
