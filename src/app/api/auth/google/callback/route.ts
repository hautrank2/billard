import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { database, GameError } from "~/lib/billiard/db";
import { exchangeGoogleCode, GOOGLE_FLOW } from "~/lib/billiard/google";
import { SESSION, signInGoogle, userBySession } from "~/lib/billiard/players";

export const runtime = "nodejs";

export const GET = async (request: Request) => {
  const jar = await cookies();
  const flow = jar.get(GOOGLE_FLOW)?.value;
  jar.set(GOOGLE_FLOW, "", { path: "/api/auth/google", maxAge: 0 });
  try {
    const params = new URL(request.url).searchParams;
    const [state, verifier] = flow?.split(".") ?? [];
    const received = params.get("state");
    const code = params.get("code");
    if (!state || !verifier || !received || !code || received.length !== state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(received))) throw new GameError(401, "Phiên đăng nhập hết hạn hoặc đã bị hủy. Hãy thử lại.");
    const identity = await exchangeGoogleCode(code, verifier);
    const db = await database();
    const guest = await userBySession(db, jar.get(SESSION)?.value);
    const user = await signInGoogle(db, identity, guest);
    const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    jar.set(SESSION, user.token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 31_536_000 });
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", error instanceof GameError ? error.message : "Không thể đăng nhập Google. Hãy thử lại.");
    return NextResponse.redirect(url);
  }
};
