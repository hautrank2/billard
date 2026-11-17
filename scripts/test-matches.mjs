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
const { createPlayer, readPlayer, updateCueInventory, userBySession } = await import("../src/lib/billiard/players.ts");
const { requestMatch, lobby, playMatch, manageMatch, touchQueue, leaveQueue } = await import("../src/lib/billiard/matches.ts");
const { chooseComputerShot, replayShot, resolveMatchShot } = await import("../src/app/billiard/_components/billiard-game/match-play.ts");
const { createGame, stepPhysics } = await import("../src/app/billiard/_components/billiard-game/engine.ts");
const { DEFAULT_OPTIONS } = await import("../src/app/billiard/_components/billiard-game/config.ts");
const { DEFAULT_LOADOUT } = await import("../src/app/billiard/_components/billiard-game/cues.ts");
const { PHYSICS_CONFIG } = await import("../src/app/billiard/_components/billiard-game/constants.ts");

const options = { rule: "nine", table: "mr-sung" };
const command = { angle: Math.PI, power: 30, spin: { x: 0, y: 0 }, elevation: 0, mode: "glide", pushOut: false };
const testUri = process.env.MONGODB_TEST_URI;
const mongoTest = { skip: testUri ? false : "Set MONGODB_TEST_URI for transaction tests" };

const fixture = async (context) => {
  const name = `Billard_test_${randomUUID().replaceAll("-", "")}`;
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
  return { db, first, second, outsider, name };
};

const pair = async (db, first, second) => {
  await requestMatch(db, first.id, "online", options);
  return requestMatch(db, second.id, "online", options);
};

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

test("matches simultaneous requests by rule and table, rejects outsiders and ignores expired queues", mongoTest, async (t) => {
  const { db, first, second, outsider } = await fixture(t);
  assert.equal(await requestMatch(db, second.id, "online", { ...options, rule: "eight" }), undefined);
  await db.queue.updateOne({ _id: second.id }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await requestMatch(db, outsider.id, "online", { ...options, rule: "eight" }), undefined);
  await leaveQueue(db, outsider.id);
  await touchQueue(db, outsider.id);
  assert.equal((await lobby(db, outsider.id)).queued, null);
  const requests = await Promise.all([
    requestMatch(db, first.id, "online", options),
    requestMatch(db, second.id, "online", options),
  ]);
  assert.equal(requests.filter(Boolean).length, 1);
  const id = requests.find(Boolean);
  assert.equal((await lobby(db, first.id)).match.id, id);
  assert.equal((await lobby(db, second.id)).match.opponent, "Châu");
  assert.equal((await lobby(db, second.id)).queued, null);
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
  const game = createGame({ ...DEFAULT_OPTIONS, mode: "nine", tableId: options.table });
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
