import { NextResponse, type NextRequest } from "next/server";

/**
 * Chequeo optimista: si no hay cookie de sesión, redirige al login sin llegar
 * a renderizar la página. NO es la barrera de seguridad: la validación real
 * de sesión y permisos ocurre en el servidor (layouts, páginas y acciones).
 */
// /api/cron se autentica con su propio token (Authorization: Bearer CRON_SECRET).
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/cron"];
const SESSION_COOKIES = ["session", "__Host-session"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye estáticos, imágenes, íconos y el manifest.
  matcher: ["/((?!_next/static|_next/image|icons/|icon.png|manifest.webmanifest|favicon.ico|sw.js|robots.txt).*)"],
};
