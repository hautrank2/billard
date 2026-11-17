import type { Ball, BallGroup, GameRule, GameState, RuleSpec } from "./type";

// WPA racks. 9-ball: 1 at the apex, 9 in the middle. 10-ball: 10 in the
// middle of the third row, 2 and 3 on the back corners. 8-ball: 8 in the
// middle of the third row, a solid and a stripe on the back corners.
export const RULES: Readonly<Record<GameRule, RuleSpec>> = Object.freeze({
  eight: {
    name: "8 bi",
    label: "8-BALL",
    money: 8,
    rack: [[1], [11, 6], [5, 8, 13], [10, 3, 14, 7], [2, 15, 4, 12, 9]],
  },
  nine: {
    name: "9 bi",
    label: "9-BALL",
    money: 9,
    rack: [[1], [2, 3], [4, 9, 5], [6, 7], [8]],
  },
  ten: {
    name: "10 bi",
    label: "10-BALL",
    money: 10,
    rack: [[1], [4, 5], [6, 10, 7], [2, 8, 9, 3]],
  },
});

export const BALL_GROUP_LABELS: Record<BallGroup, string> = {
  solids: "bi trơn (1–7)",
  stripes: "bi sọc (9–15)",
};

export const ballGroup = (id: number): BallGroup | null => {
  if (id > 0 && id < 8) return "solids";
  return id > 8 ? "stripes" : null;
};

// Drills have no break: every attempt is an ordinary stroke.
export const isBreakShot = (game: GameState) =>
  game.options.mode !== "drill" && game.shots === 0;

export const isOver = (game: GameState) =>
  game.won || game.lost || Boolean(game.drill?.result);

const objectBallsOnTable = (game: GameState) => game.balls
  .filter((ball) => ball.id > 0 && !ball.pocketed)
  .map((ball) => ball.id)
  .sort((a, b) => a - b);

// The balls the next stroke may contact first.
export const legalTargets = (game: GameState): number[] => {
  if (game.drill) return [game.drill.target];
  const onTable = objectBallsOnTable(game);
  if (game.options.mode !== "eight") return onTable.slice(0, 1);
  if (isBreakShot(game)) return onTable;
  // An open table allows either group, never the 8 first.
  const open = onTable.filter((id) => id !== 8);
  const own = game.group
    ? open.filter((id) => ballGroup(id) === game.group)
    : open;
  return own.length > 0 ? own : onTable.filter((id) => id === 8);
};

export const targetLabel = (game: GameState) => {
  const legal = legalTargets(game);
  if (game.options.mode !== "eight") {
    return legal.length > 0 ? `bi ${legal[0]}` : "";
  }
  if (isBreakShot(game)) return "cụm bi";
  if (game.group && legal.length === 1 && legal[0] === 8) return "bi 8";
  return game.group ? BALL_GROUP_LABELS[game.group] : "bi bất kỳ trừ bi 8";
};

// The legal ball nearest the cue ball, which the aim turns to after a stroke.
export const aimTarget = (game: GameState): Ball | undefined => {
  const cue = game.balls.find((ball) => ball.id === 0);
  const legal = legalTargets(game);
  const candidates = game.balls.filter((ball) =>
    legal.includes(ball.id) && !ball.pocketed);
  if (!cue) return candidates[0];
  const distance = (ball: Ball) => Math.hypot(ball.x - cue.x, ball.z - cue.z);
  return candidates.reduce<Ball | undefined>(
    (best, ball) => !best || distance(ball) < distance(best) ? ball : best,
    undefined,
  );
};
