import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const normalizedEmail = String(email ?? '').trim();
    const normalizedPassword = String(password ?? '').trim();

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (error) {
      const normalizedErrorMessage = error.message.toLowerCase();
      const status = normalizedErrorMessage.includes('email not confirmed') ? 403 : 400;
      const message = normalizedErrorMessage.includes('email not confirmed')
        ? 'Confirm your email before logging in. Check your inbox for the verification message.'
        : error.message;

      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({
      success: true,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email ?? normalizedEmail,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to log in:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
