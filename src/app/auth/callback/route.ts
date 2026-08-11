import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // setAll is called from Server Component context where cookies
              // can't be set — the middleware will handle refreshing instead.
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Redirect to login with error indication for invalid/expired codes
      return NextResponse.redirect(`${origin}/login?error=callback_failed`);
    }

    // Password recovery flow — redirect to set new password form
    const type = searchParams.get('type');
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    // Check if onboarding is complete
    if (data?.session) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', data.session.user.id)
        .single();

      if (!profile?.onboarding_completed) {
        return NextResponse.redirect(`${origin}/signup?step=profile`);
      }
    }
  }

  // Default: redirect to dashboard
  return NextResponse.redirect(`${origin}/portfolio`);
}
