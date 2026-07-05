import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  // Build a response that will carry the auth cookies
  const response = NextResponse.redirect(new URL('/update-password', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let error: Error | null = null;

  // PKCE flow: code from URL → exchange for session
  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  }
  // OTP flow: token_hash + type from URL → verify OTP
  else if (token_hash && type) {
    const result = await supabase.auth.verifyOtp({ type, token_hash });
    error = result.error;
  } else {
    return NextResponse.redirect(new URL('/login?error=invalid-link', request.url));
  }

  if (error) {
    console.error('Auth confirm error:', error.message);
    return NextResponse.redirect(new URL('/login?error=auth-failed', request.url));
  }

  return response;
}
