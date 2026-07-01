import { NextResponse, type NextRequest } from 'next/server';

function isPublicPath(pathname: string) {
  return pathname === '/'
    || pathname.startsWith('/sign-up')
    || pathname.startsWith('/login')
    || pathname.startsWith('/forgot-password')
    || pathname.startsWith('/update-password')
    || pathname.startsWith('/reset-password')
    || pathname.startsWith('/auth')
    || pathname.startsWith('/api')
    || pathname.startsWith('/_next');
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasSessionCookie = hasSupabaseSessionCookie(request);

  if (!hasSessionCookie && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('message', 'Please log in to access your vault.');
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
