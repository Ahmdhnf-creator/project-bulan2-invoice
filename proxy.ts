import { auth } from "@/app/lib/auth";
import type { NextAuthRequest } from "next-auth";
import {
  NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";

// Tipe overload `auth()` di next-auth 5 beta ambigu (middleware vs route
// handler); pada kenyataannya selalu mengembalikan Response final.
const authProxy = auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;

  const isPublicRoute =
    pathname === "/login" || pathname.startsWith("/api/auth");

  if (!req.auth && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}) as unknown as (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response>;

// next-auth 5 beta me-re-sign JWT sesi di SETIAP request yang lewat
// middleware dan menempelkannya sebagai Set-Cookie ("rolling refresh",
// lihat next-auth/lib/index.js handleAuth + @auth/core actions/session).
// Re-sign dari request paralel (RSC prefetch, navigasi) bisa tiba SETELAH
// clear cookie dari aksi logout sehingga sesi "hidup lagi" — race tak
// menentu (github.com/nextauthjs/next-auth/issues/12909).
// Buang hanya re-sign (value non-empty); clear (value kosong) dan cookie
// yang di-set oleh aplikasi sendiri (login) tetap diteruskan.
function stripSessionRefresh(response: Response): Response {
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) return response;

  const kept = setCookies.filter((cookie) => {
    const eq = cookie.indexOf("=");
    const name = eq === -1 ? cookie : cookie.slice(0, eq);
    const rawValue = eq === -1 ? "" : cookie.slice(eq + 1);
    const value = rawValue.split(";")[0].trim();
    if (!name.includes("session-token")) return true;
    return value === "";
  });

  if (kept.length === setCookies.length) return response;

  response.headers.delete("set-cookie");
  for (const cookie of kept) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const response = await authProxy(request, event);
  return stripSessionRefresh(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
