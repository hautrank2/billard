import { HALL_BOUNDS } from "~/app/_components/lobby/hall-layout";
import { cookies } from "next/headers";
import { z } from "zod";

import { SPIN_MAX_OFFSET } from "~/app/billiard/_components/billiard-game/constants";
import { database, GameError } from "~/lib/billiard/db";
import { closeHallTable, joinHallTable, moveInHall, openHallTable, postHallMessage, readHall } from "~/lib/billiard/hall";
import { leaveQueue, lobby, manageMatch, playMatch, requestMatch, touchQueue } from "~/lib/billiard/matches";
import { createPlayer, savePlayer, SESSION, updateCueInventory, userBySession } from "~/lib/billiard/players";
import type { GameDatabase } from "~/lib/billiard/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const matchId = z.uuid();
const name = z.string().trim().min(2).max(24).regex(/^[^\p{Cc}]+$/u);
const details = z.strictObject({
  gender: z.enum(["male", "female"]),
  birthYear: z.number().int().min(1900).refine((year) => year <= new Date().getUTCFullYear()).optional(),
  address: z.string().trim().min(1).max(100).regex(/^[^\p{Cc}]+$/u).optional(),
});
const password = z.string().min(1).max(64).optional();
const rules = {
  rule: z.enum(["eight", "nine", "ten"]),
  // Accept the previous request shape while the server assigns the table.
  table: z.enum(["mr-sung", "predator"]).optional(),
};
const version = { id: matchId, version: z.number().int().min(0) };
const shot = z.strictObject({
  angle: z.number().min(-Math.PI * 2).max(Math.PI * 2),
  power: z.number().min(1).max(100),
  spin: z.strictObject({ x: z.number(), y: z.number() })
    .refine(({ x, y }) => Math.hypot(x, y) <= SPIN_MAX_OFFSET + 1e-8),
  mode: z.enum(["glide", "jump"]),
  elevation: z.number().min(0).max(90),
  placement: z.strictObject({ x: z.number().min(-5).max(5), z: z.number().min(-5).max(5) }).optional(),
  pushOut: z.boolean(),
});

const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("motion"), motion: z.strictObject({
    x: z.number().min(-HALL_BOUNDS.x).max(HALL_BOUNDS.x), z: z.number().min(-HALL_BOUNDS.z).max(HALL_BOUNDS.z), y: z.number().min(0).max(2),
    yaw: z.number().min(-Math.PI).max(Math.PI), pitch: z.number().min(-1.35).max(1.35),
    sitting: z.boolean(), action: z.enum(["idle", "hit", "wave"]),
  }) }),
  z.strictObject({ type: z.literal("profile"), name, details: details.optional() }),
  z.strictObject({ type: z.literal("table-open"), rule: rules.rule, password }),
  z.strictObject({ type: z.literal("table-join"), id: matchId, password }),
  z.strictObject({ type: z.literal("table-close") }),
  z.strictObject({ type: z.literal("chat"), text: z.string().trim().min(1).max(240).regex(/^[^\p{Cc}]+$/u) }),
  z.strictObject({ type: z.literal("cue"), id: z.string().max(40), action: z.enum(["buy", "equip"]) }),
  z.strictObject({ type: z.literal("queue"), ...rules }),
  z.strictObject({ type: z.literal("practice"), ...rules }),
  z.strictObject({ type: z.literal("leave") }),
  z.strictObject({ type: z.literal("shot"), ...version, shot }),
  z.strictObject({ type: z.literal("computer"), ...version }),
  z.strictObject({ type: z.literal("manage"), ...version, action: z.enum(["resign", "timeout", "pass"]) }),
]);

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const viewResponse = async (db: GameDatabase, user: string | null, includeHall: boolean, id?: string) => {
  const view = await lobby(db, user, id);
  if (!user || !includeHall) return reply(view);
  const hall = await readHall(db, user, Boolean(view.match && !view.match.result));
  return reply({ ...view, hall });
};

const respond = async (operation: () => Promise<Response>) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GameError) return reply({ error: error.message }, error.status);
    console.error("Billiard API request failed", error instanceof Error ? error.name : "");
    return reply({ error: "Máy chủ gặp lỗi. Hãy thử lại." }, 500);
  }
};

export const GET = (request: Request) => respond(async () => {
  const params = new URL(request.url).searchParams;
  const requested = params.get("match");
  const token = (await cookies()).get(SESSION)?.value;
  if (!token && !requested) return reply({ player: null, history: [], cues: [], match: null, queued: null });
  const db = await database();
  const user = await userBySession(db, token);
  if (requested && !matchId.safeParse(requested).success) {
    throw new GameError(404, "Không tìm thấy trận đấu.");
  }
  if (requested && !user) throw new GameError(401, "Hãy tạo hồ sơ trước.");
  if (user && params.get("search") === "1") await touchQueue(db, user);
  return viewResponse(db, user, params.get("hall") === "1", requested ?? undefined);
});

export const POST = (request: Request) => respond(async () => {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new GameError(403, "Yêu cầu từ trang khác.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new GameError(415, "Cần gửi dữ liệu JSON.");
  }
  const body = await request.text();
  if (body.length > 4096) throw new GameError(413, "Yêu cầu quá lớn.");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new GameError(400, "Dữ liệu JSON không hợp lệ.");
  }
  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) throw new GameError(400, "Dữ liệu gửi lên không hợp lệ.");

  const action = parsed.data;
  const db = await database();
  const jar = await cookies();
  let user = await userBySession(db, jar.get(SESSION)?.value);
  if (action.type === "profile") {
    if (user) {
      await savePlayer(db, user, action.name, action.details);
    } else {
      const created = await createPlayer(db, action.name, action.details);
      user = created.id;
      const url = new URL(request.url);
      const secure = url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
      jar.set(SESSION, created.token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 31_536_000 });
    }
    return reply(await lobby(db, user));
  }
  if (!user) throw new GameError(401, "Hãy tạo hồ sơ trước.");

  let id: string | undefined;
  switch (action.type) {
    case "motion":
      await moveInHall(db, user, action.motion);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    case "table-open":
      await openHallTable(db, user, { rule: action.rule }, action.password);
      break;
    case "table-join":
      id = await joinHallTable(db, user, action.id, action.password);
      break;
    case "table-close":
      await closeHallTable(db, user);
      break;
    case "chat":
      await postHallMessage(db, user, action.text);
      break;
    case "cue":
      await updateCueInventory(db, user, action.id, action.action);
      break;
    case "queue":
    case "practice":
      id = await requestMatch(db, user, action.type === "queue" ? "online" : "ai", { rule: action.rule });
      break;
    case "leave":
      await leaveQueue(db, user);
      break;
    case "shot":
    case "computer":
      id = action.id;
      await playMatch(db, user, id, action.version, action.type === "shot" ? action.shot : undefined);
      break;
    case "manage":
      id = action.id;
      await manageMatch(db, user, id, action.version, action.action);
      break;
  }
  return viewResponse(db, user, new URL(request.url).searchParams.get("hall") === "1", id);
});
