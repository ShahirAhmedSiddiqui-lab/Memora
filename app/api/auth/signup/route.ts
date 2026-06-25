import { NextRequest, NextResponse } from 'next/server';
import { type User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SUPABASE_EMAIL_CONFIRMATION_REDIRECT_URL } from '@/lib/supabase/auth-redirects';

function isExistingSignupAttempt(user: User | null) {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, name } = await req.json();

    const normalizedEmail = String(email ?? '').trim();
    const normalizedPassword = String(password ?? '').trim();
    const normalizedName = String(fullName ?? name ?? '').trim();

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    if (normalizedPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
      options: {
        emailRedirectTo: SUPABASE_EMAIL_CONFIRMATION_REDIRECT_URL,
        data: {
          full_name: normalizedName || undefined,
          name: normalizedName || undefined,
        },
      },
    });

    if (error) {
      console.error('Signup error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (isExistingSignupAttempt(data.user)) {
      return NextResponse.json(
        {
          error: 'This email already has an account. Try logging in instead.',
          code: 'existing_account',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      requiresEmailConfirmation: !data.session,
      message: data.session
        ? 'Account created successfully.'
        : 'Account created. Check your email to confirm your signup, then log in.',
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email ?? normalizedEmail,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to sign up:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
