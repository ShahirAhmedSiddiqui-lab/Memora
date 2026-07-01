import { redirect } from 'next/navigation';
import { AuthShell } from '../_components/auth-shell';
import { createClient } from '@/lib/supabase/server';
import { getSafeUser } from '@/lib/supabase/auth';
import { LoginFormClient } from '../login/login-form-client';

export default async function SignUpPage({
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
    <AuthShell
      eyebrow="Create Account"
      title="Start building your memory vault."
      description="Create your Memora account to save links, PDFs, voice notes, screenshots, and AI-structured recall cards in one protected space."
      formTitle="Create your Memora account"
    >
      <LoginFormClient initialMessage={message} mode="signup" />
    </AuthShell>
  );
}
