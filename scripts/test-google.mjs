import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/src/") && specifier.startsWith(".") && !specifier.endsWith(".ts")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const { exchangeGoogleCode, googleAuthorization, googleConfig } = await import("../src/lib/billiard/google.ts");

const configure = (t) => {
  const values = { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", GOOGLE_REDIRECT_URI: "http://localhost:8083/api/auth/google/callback" };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
};

test("Google authorization uses a unique state, PKCE and only identity scopes", (t) => {
  configure(t);
  const { url, state, verifier } = googleAuthorization();
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.notEqual(googleAuthorization().state, state);
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.throws(googleConfig, { status: 503 });
});

test("Google code is exchanged on the server and only verified Gmail identities are accepted", async (t) => {
  configure(t);
  let verified = true;
  let email = "Player@gmail.com";
  let tokenAccepted = true;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("code_verifier"), "test-verifier");
      assert.equal(options.body.get("client_secret"), "test-secret");
      return Response.json(tokenAccepted ? { access_token: "server-token" } : { error: "invalid_grant" }, { status: tokenAccepted ? 200 : 400 });
    }
    assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
    assert.equal(options.headers.Authorization, "Bearer server-token");
    return Response.json({ sub: "google-subject", email, email_verified: verified, name: "Player" });
  });
  assert.deepEqual(await exchangeGoogleCode("code", "test-verifier"), {
    sub: "google-subject", email: "player@gmail.com", email_verified: true, name: "Player",
  });
  verified = false;
  await assert.rejects(exchangeGoogleCode("code", "test-verifier"), { status: 403 });
  verified = true; email = "player@example.com";
  await assert.rejects(exchangeGoogleCode("code", "test-verifier"), { status: 403 });
  tokenAccepted = false;
  await assert.rejects(exchangeGoogleCode("code", "test-verifier"), { status: 401 });
});
