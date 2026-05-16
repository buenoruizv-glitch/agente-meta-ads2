import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedPaths = [
  '/dashboard',
  '/campaigns',
  '/analytics',
  '/automation',
  '/chat',
  '/settings',
];

export function proxy(request: NextRequest) {
  // Use sb-access-token which is what Supabase uses in this app
  const token = request.cookies.get('sb-access-token')?.value;
  const { pathname } = request.nextUrl;

  console.log(`Proxy: ${pathname} | Token present: ${!!token}`);

  // Check if current path is protected
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  // If path is protected and there is no session, redirect to login
  if (isProtectedPath && !token) {
    console.log(`Proxy: Redirecting unauthenticated user from ${pathname} to /login`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If going to login but already has session, redirect to dashboard
  if (pathname === '/login' && token) {
    console.log(`Proxy: Redirecting authenticated user from /login to /dashboard`);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
