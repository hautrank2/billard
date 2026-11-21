import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GameError } from "~/lib/billiard/db";
import { GOOGLE_FLOW, googleAuthorization } from "~/lib/billiard/google";
import { SESSION } from "~/lib/billiard/players";

export const runtime = "nodejs";

export const GET = async (request: Request) => {
  try {
    const { url, state, verifier } = googleAuthorization();
    const jar = await cookies();
    const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    // Existing guest sessions used Strict; Lax lets the OAuth callback retain that profile.
    const token = jar.get(SESSION)?.value;
    if (token) jar.set(SESSION, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 31_536_000 });
    jar.set(GOOGLE_FLOW, `${state}.${verifier}`, {
      httpOnly: true, sameSite: "lax", secure,
      path: "/api/auth/google", maxAge: 600,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", error instanceof GameError ? error.message : "Không thể kết nối Google.");
    return NextResponse.redirect(url);
  }
};
