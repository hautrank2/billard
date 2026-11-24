import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { MongoClient } from "mongodb";

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/src/") && specifier.startsWith(".") && !specifier.endsWith(".ts")) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { openDatabase } = await import("../src/lib/billiard/db.ts");
const { createPlayer, readPlayer, savePlayer, signInGoogle, updateBalance, updateCueInventory, userBySession } = await import("../src/lib/billiard/players.ts");
const { transaction } = await import("../src/lib/billiard/db.ts");
const { readHall, openHallTable, joinHallTable, moveInHall, postHallMessage } = await import("../src/lib/billiard/hall.ts");
const { isHallWalkable, moveHallPosition, tablePositions } = await import("../src/app/_components/lobby/hall-layout.ts");
const { requestMatch, lobby, playMatch, manageMatch, touchQueue, leaveQueue } = await import("../src/lib/billiard/matches.ts");
const { chooseComputerShot, replayShot, resolveMatchShot } = await import("../src/app/billiard/_components/billiard-game/match-play.ts");
const { createGame, stepPhysics } = await import("../src/app/billiard/_components/billiard-game/engine.ts");
const { DEFAULT_OPTIONS } = await import("../src/app/billiard/_components/billiard-game/config.ts");
const { DEFAULT_LOADOUT } = await import("../src/app/billiard/_components/billiard-game/cues.ts");
const { PHYSICS_CONFIG } = await import("../src/app/billiard/_components/billiard-game/constants.ts");

const options = { rule: "nine" };
const command = { angle: Math.PI, power: 30, spin: { x: 0, y: 0 }, elevation: 0, mode: "glide", pushOut: false };
const testUri = process.env.MONGODB_TEST_URI;
const mongoTest = { skip: testUri ? false : "Set MONGODB_TEST_URI for transaction tests" };

const fixture = async (context, registered = true) => {
  const name = `Billard_test_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const client = new MongoClient(testUri, { serverSelectionTimeoutMS: 4000, ignoreUndefined: true });
  context.after(async () => {
    try {
      await client.db(name).dropDatabase();
    } finally {
      await client.close();
    }
  });
  const db = await openDatabase(client, name);
  const first = await createPlayer(db, "Châu");
  const second = await createPlayer(db, "An");
  const outsider = await createPlayer(db, "Vi");
  if (registered) {
    for (const player of [first, second, outsider]) {
      const signed = await signInGoogle(db, { sub: player.id, email: `${player.id}@gmail.com`, name: "Người chơi" }, player.id);
      player.token = signed.token;
    }
  }
  return { db, first, second, outsider, name };
};

test("hall movement blocks walls, tables and counter while sliding along obstacles", () => {
  assert.equal(isHallWalkable(-11, 0), true);
  assert.equal(isHallWalkable(0, 0), true);
  for (const table of tablePositions) assert.equal(isHallWalkable(table.x, table.z), false);
  assert.equal(isHallWalkable(18.4, 0), false);
  assert.equal(isHallWalkable(17, 0), true);
  assert.equal(isHallWalkable(16.5, -3), false);
  assert.equal(isHallWalkable(NaN, 0), false);
  assert.deepEqual(moveHallPosition(-18.2, 0, -.3, .2), { x: -18.2, z: .2 });
  const table = tablePositions[0];
  const z = table.z + 1.15;
  const slide = moveHallPosition(table.x, z, .1, -.6);
  assert.ok(Math.abs(slide.x - (table.x + .1)) < 1e-8);
  assert.equal(slide.z, z);
});

test("guests can play but cannot earn or spend coins; Gmail upgrade is persistent and granted once", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t, false);
  assert.equal((await readPlayer(db, first.id)).coins, 0);
  await assert.rejects(updateCueInventory(db, first.id, "glide-walnut", "buy"), { status: 403 });
  await transaction(db, (session) => updateBalance(db, session, first.id, "guest-win", 30, 10));
  assert.equal((await readPlayer(db, first.id)).coins, 0);
  assert.equal(await db.transactions.countDocuments({ userId: first.id }), 0);
  const id = await pair(db, first, second);
  assert.equal((await lobby(db, second.id)).match.id, id);
  await manageMatch(db, first.id, id, 0, "resign");
  const identity = { sub: "verified-google-id", email: "billiard.test@gmail.com", name: "Người chơi" };
  const signed = await signInGoogle(db, identity, first.id);
  assert.equal(signed.id, first.id);
  assert.equal(await userBySession(db, signed.token), first.id);
  assert.equal(await userBySession(db, first.token), null);
  const again = await signInGoogle(db, identity, null);
  assert.equal(again.id, first.id);
  assert.equal((await lobby(db, first.id)).player.registered, true);
  assert.equal((await readPlayer(db, first.id)).coins, 200);
  assert.equal(await db.transactions.countDocuments({ userId: first.id, reference: "gmail-starter" }), 1);
});

test("hall shares movement and poses and expires disconnected avatars", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t, false);
  const motion = { x: -10, z: 0, y: .5, yaw: 1, pitch: -.4, sitting: false, action: "hit" };
  await moveInHall(db, first.id, motion);
  assert.deepEqual((await readHall(db, second.id, false)).people.find(({ id }) => id === first.id).motion, motion);
  await assert.rejects(moveInHall(db, first.id, { ...motion, x: -8.25, z: -2.35 }), { status: 400 });
  await db.presence.updateOne({ _id: first.id }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await readHall(db, second.id, false)).people.some(({ id }) => id === first.id), false);
});

const pair = async (db, first, second) => {
  await requestMatch(db, first.id, "online", options);
  return requestMatch(db, second.id, "online", options);
};

test("guest hall shares avatars and chat, and a locked table assigns one match to exactly two profiles", mongoTest, async (t) => {
  const { db, first, second, outsider } = await fixture(t);
  await savePlayer(db, first.id, "Châu", { gender: "female", birthYear: 2000, address: "Hà Nội" });
  await savePlayer(db, second.id, "An", { gender: "male" });
  await readHall(db, first.id, false);
  await postHallMessage(db, first.id, "Chào cả sảnh!");
  await assert.rejects(postHallMessage(db, first.id, "Tin lặp"), { status: 429 });
  await openHallTable(db, first.id, options, "open sesame");
  const shared = await readHall(db, second.id, false);
  assert.deepEqual(shared.people.find(({ id }) => id === first.id), { id: first.id, name: "Châu", gender: "female" });
  assert.equal(shared.messages.at(-1).text, "Chào cả sảnh!");
  const [table] = shared.tables;
  assert.equal(table.locked, true);
  assert.equal(Object.hasOwn(table, "passwordHash"), false);
  await assert.rejects(joinHallTable(db, second.id, table.id, "wrong"), { status: 403 });
  const joins = await Promise.allSettled([
    joinHallTable(db, second.id, table.id, "open sesame"),
    joinHallTable(db, outsider.id, table.id, "open sesame"),
  ]);
  assert.equal(joins.filter(({ status }) => status === "fulfilled").length, 1);
  const matchId = joins.find(({ status }) => status === "fulfilled").value;
  assert.equal((await lobby(db, first.id)).match.id, matchId);
  assert.equal((await readHall(db, first.id, true)).tables[0].playing, true);
});

test("profiles, cue ownership and coin balances survive reconnecting and concurrent purchases", mongoTest, async (t) => {
  const { db, first, name } = await fixture(t);
  assert.equal(await userBySession(db, first.token), first.id);
  assert.equal(await userBySession(db, "0".repeat(64)), null);
  await assert.rejects(updateCueInventory(db, first.id, "glide-walnut", "equip"), { status: 409 });
  await Promise.all([
    updateCueInventory(db, first.id, "glide-walnut", "buy"),
    updateCueInventory(db, first.id, "glide-walnut", "buy"),
  ]);
  await updateCueInventory(db, first.id, "glide-walnut", "equip");
  await assert.rejects(updateCueInventory(db, first.id, "break-graphite", "buy"), { status: 409 });
  assert.equal(await db.transactions.countDocuments({ userId: first.id }), 2);

  const client = new MongoClient(testUri);
  t.after(() => client.close());
  const reopened = await openDatabase(client, name);
  assert.equal(await userBySession(reopened, first.token), first.id);
  const view = await lobby(reopened, first.id);
  assert.equal(view.player.coins, 50);
  assert.equal(view.player.loadout.glide, "glide-walnut");
  assert.equal(view.cues.find((cue) => cue.id === "glide-walnut").owned, true);
  assert.equal(await reopened.migrations.countDocuments({ appliedAt: { $exists: true } }), 1);
});

test("matches simultaneous requests by rule, ignores old table preferences, and rejects outsiders and expired queues", mongoTest, async (t) => {
  const { db, first, second, outsider } = await fixture(t);
  assert.equal(await requestMatch(db, second.id, "online", { ...options, rule: "eight" }), undefined);
  await db.queue.updateOne({ _id: second.id }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await requestMatch(db, outsider.id, "online", { ...options, rule: "eight" }), undefined);
  await leaveQueue(db, outsider.id);
  await touchQueue(db, outsider.id);
  assert.equal((await lobby(db, outsider.id)).queued, null);
  // Older clients left a table preference in the queue.
  await db.queue.insertOne({
    _id: first.id, rule: "nine", table: "predator", joinedAt: new Date(), expiresAt: new Date(Date.now() + 35_000),
  });
  const requests = await Promise.all([
    requestMatch(db, first.id, "online", options),
    requestMatch(db, second.id, "online", options),
  ]);
  // A retried request can return the match already assigned by the other request.
  assert.equal(new Set(requests.filter(Boolean)).size, 1);
  assert.equal(await db.matches.countDocuments({ completedAt: null }), 1);
  const id = requests.find(Boolean);
  const firstView = await lobby(db, first.id);
  const secondView = await lobby(db, second.id);
  assert.equal(firstView.match.id, id);
  assert.equal(secondView.match.opponent, "Châu");
  assert.ok(["mr-sung", "predator"].includes(firstView.match.game.options.tableId));
  assert.equal(secondView.match.game.options.tableId, firstView.match.game.options.tableId);
  assert.equal(secondView.queued, null);
  assert.equal(await requestMatch(db, first.id, "ai", options), id);
  await assert.rejects(lobby(db, outsider.id, id), { status: 404 });
});

test("validates turns, placement and version while reproducing the authoritative shot", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t);
  const id = await pair(db, first, second);
  const before = (await lobby(db, first.id, id)).match;
  await assert.rejects(playMatch(db, second.id, id, 0, command), { status: 409 });
  await assert.rejects(playMatch(db, first.id, id, 0, { ...command, placement: { x: 2, z: 2 } }), { status: 422 });
  assert.equal((await lobby(db, first.id, id)).match.version, 0);
  await Promise.all([playMatch(db, first.id, id, 0, command), playMatch(db, first.id, id, 0, command)]);
  const after = (await lobby(db, second.id, id)).match;
  assert.equal(after.version, 1);
  assert.equal(after.turn, 1);
  assert.equal(after.game.fouls, 1);
  assert.equal(after.game.ballInHand, true);
  assert.equal(replayShot(before.game, after.replay), true);
  for (let i = 0; before.game.moving && i < 20_000; i++) stepPhysics(before.game, PHYSICS_CONFIG.stepSeconds);
  assert.deepEqual(before.game.balls, after.game.balls);
});

test("the computer takes its own turn and practice creates a result without ranked rewards", mongoTest, async (t) => {
  const { db, first } = await fixture(t);
  const id = await requestMatch(db, first.id, "ai", options);
  await assert.rejects(playMatch(db, first.id, id, 0), { status: 409 });
  await playMatch(db, first.id, id, 0, command);
  assert.equal((await lobby(db, first.id, id)).match.turn, 1);
  await assert.rejects(playMatch(db, first.id, id, 1, command), { status: 409 });
  await playMatch(db, first.id, id, 1);
  assert.equal((await lobby(db, first.id, id)).match.game.shots, 2);
  await manageMatch(db, first.id, id, 2, "resign");
  const view = await lobby(db, first.id);
  assert.equal(view.history[0].opponent, "Máy");
  assert.equal(view.player.points, 0);
  assert.equal(view.player.coins, 200);
});

test("a legal rack win awards exactly once and releases both players", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t);
  const id = await pair(db, first, second);
  const { match } = await lobby(db, first.id, id);
  const game = createGame(match.game.options);
  game.balls = game.balls.filter((ball) => ball.id === 0 || ball.id === 9);
  Object.assign(game.balls[0], { x: 0, z: 0 });
  Object.assign(game.balls[1], { x: 0.4, z: 0 });
  game.shots = 3;
  game.cueInHand = false;
  await db.matches.updateOne({ _id: id }, { $set: { state: game } });
  const shot = { ...command, angle: Math.PI / 2, power: 55 };
  await Promise.all([playMatch(db, first.id, id, 0, shot), playMatch(db, first.id, id, 0, shot)]);
  assert.deepEqual((await lobby(db, first.id, id)).match.result, { winner: 0, reason: "rack" });
  await manageMatch(db, first.id, id, 1, "resign");
  assert.equal((await lobby(db, first.id)).match, null);
  assert.equal((await lobby(db, second.id)).history[0].won, false);
  assert.equal((await readPlayer(db, first.id)).coins, 230);
  assert.equal((await readPlayer(db, first.id)).points, 10);
  assert.equal((await readPlayer(db, second.id)).coins, 200);
  assert.equal(await db.transactions.countDocuments({ reference: `match:${id}` }), 1);
});

test("a timeout records the result without a reward for an unplayed rack", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t);
  const id = await pair(db, first, second);
  await assert.rejects(manageMatch(db, second.id, id, 0, "timeout"), { status: 409 });
  await db.matches.updateOne({ _id: id }, { $set: { deadline: 0 } });
  await manageMatch(db, second.id, id, 0, "timeout");
  assert.deepEqual((await lobby(db, first.id, id)).match.result, { winner: 1, reason: "timeout" });
  assert.equal((await readPlayer(db, second.id)).coins, 200);
});

test("8-ball switches assigned groups on a foul and the bot can break", () => {
  const game = createGame({ ...DEFAULT_OPTIONS, mode: "eight" });
  game.group = "solids";
  game.cueInHand = false;
  game.shots = 2;
  const result = resolveMatchShot(game, command, DEFAULT_LOADOUT);
  assert.equal(result.keepsTurn, false);
  assert.equal(result.game.group, "stripes");
  assert.equal(result.game.ballInHand, true);

  const opening = createGame({ ...DEFAULT_OPTIONS, mode: "eight" });
  opening.ballInHand = true;
  assert.equal(resolveMatchShot(opening, chooseComputerShot(opening), DEFAULT_LOADOUT).game.shots, 1);
});

test("a legal push-out permits only the next player to return the table", mongoTest, async (t) => {
  const { db, first, second } = await fixture(t);
  const id = await pair(db, first, second);
  const game = (await lobby(db, first.id, id)).match.game;
  game.shots = 1;
  game.ballInHand = false;
  game.cueInHand = false;
  game.pushOut = "offered";
  await db.matches.updateOne({ _id: id }, { $set: { state: game } });
  await playMatch(db, first.id, id, 0, { ...command, pushOut: true });
  assert.equal((await lobby(db, second.id, id)).match.canPass, true);
  await assert.rejects(manageMatch(db, first.id, id, 1, "pass"), { status: 409 });
  await manageMatch(db, second.id, id, 1, "pass");
  const { match } = await lobby(db, first.id, id);
  assert.equal(match.turn, 0);
  assert.equal(match.canPass, false);
});
