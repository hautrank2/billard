import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { GameError } from "./db";

export const GOOGLE_FLOW = "black_nine_google";
export const googleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new GameError(503, "Đăng nhập Gmail chưa được cấu hình trên máy chủ.");
  return { clientId, clientSecret, redirectUri };
};

export const googleAuthorization = () => {
  const { clientId, redirectUri } = googleConfig();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state, code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url, state, verifier };
};

export const exchangeGoogleCode = async (code: string, verifier: string) => {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  });
  const token = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!response.ok || !token.success) throw new GameError(401, "Phiên Google không hợp lệ. Hãy đăng nhập lại.");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.data.access_token}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  const identity = z.object({
    sub: z.string().min(1), email: z.email().transform((email) => email.toLowerCase()),
    email_verified: z.literal(true), name: z.string().trim().min(1).default("Người chơi"),
  }).safeParse(await info.json());
  if (!info.ok || !identity.success || !identity.data.email.endsWith("@gmail.com")) {
    throw new GameError(403, "Hãy sử dụng tài khoản Gmail đã xác thực.");
  }
  return identity.data;
};
