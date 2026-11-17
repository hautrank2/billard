import type {
  DrillId, DrillLayout, DrillResult, DrillSpec, GameState, Shot,
} from "./type";

// A bank needs a cushion contact well before the pocket, so a ball that only
// rattles in the jaws does not count.
const BANK_MIN_TRAVEL = 0.25;

const miss = (note: string): DrillResult => ({ success: false, note });
const made = (note: string): DrillResult => ({ success: true, note });

// Every drill asks the cue ball to stay up and meet the drill ball first.
const firstContactMiss = (shot: Shot, layout: DrillLayout) => {
  if (shot.pocketed.includes(0)) return "bi cái rơi lỗ.";
  if (shot.offTable.length > 0) return "bi văng khỏi bàn.";
  if (shot.firstContact === null) return "bi cái chưa chạm bi nào.";
  if (shot.firstContact !== layout.target) {
    return `bi cái chạm bi ${shot.firstContact} trước bi ${layout.target}.`;
  }
  return null;
};

const potJudge = (success: string) =>
  (_game: GameState, shot: Shot, layout: DrillLayout) => {
    const problem = firstContactMiss(shot, layout);
    if (problem) return miss(problem);
    return shot.drops[layout.target]
      ? made(success)
      : miss(`bi ${layout.target} chưa vào lỗ.`);
  };

const judgeBank = (_game: GameState, shot: Shot, layout: DrillLayout) => {
  const problem = firstContactMiss(shot, layout);
  if (problem) return miss(problem);
  const drop = shot.drops[layout.target];
  if (!drop) return miss(`bi ${layout.target} chưa vào lỗ.`);
  const banked = shot.rails.some((rail) => rail.ballId === layout.target &&
    Math.hypot(rail.x - drop.x, rail.z - drop.z) > BANK_MIN_TRAVEL);
  return banked
    ? made(`bi ${layout.target} qua băng rồi vào lỗ.`)
    : miss(`bi ${layout.target} vào thẳng, chưa qua băng.`);
};

const judgeKick = (_game: GameState, shot: Shot, layout: DrillLayout) => {
  if (shot.pocketed.includes(0)) return miss("bi cái rơi lỗ.");
  if (shot.offTable.length > 0) return miss("bi văng khỏi bàn.");
  const kicked = shot.rails.some((rail) => rail.ballId === 0 && rail.beforeContact);
  if (shot.firstContact === null) {
    return miss(kicked
      ? "bi cái qua băng nhưng không chạm bi nào."
      : "bi cái chưa chạm bi nào.");
  }
  if (!kicked) return miss("bi cái chạm bi trước khi chạm băng.");
  if (shot.firstContact !== layout.target) {
    return miss(`qua băng nhưng chạm bi ${shot.firstContact} trước.`);
  }
  return made(shot.drops[layout.target]
    ? "qua băng, chạm đúng bi và vào lỗ luôn!"
    : `qua băng, chạm đúng bi ${layout.target}.`);
};

const judgePosition = (game: GameState, shot: Shot, layout: DrillLayout) => {
  const potted = potJudge("")(game, shot, layout);
  if (!potted.success) return potted;
  const cue = game.balls.find((ball) => ball.id === 0);
  const zone = layout.zone;
  if (!cue || !zone) return potted;
  const distance = Math.hypot(cue.x - zone.x, cue.z - zone.z);
  return distance <= zone.radius
    ? made("vào bi và bi cái dừng trong vòng.")
    : miss(`vào bi, nhưng bi cái dừng cách tâm vòng ${Math.round(distance * 100)} cm.`);
};

// Positions are in metres from the table centre; +z is the head (kitchen)
// end. Every layout is checked for a working stroke in the test suite.
export const DRILLS: Readonly<Record<DrillId, DrillSpec>> = Object.freeze({
  bank: {
    id: "bank",
    name: "Ăn băng",
    goal: "Ăn băng: đưa bi 1 chạm băng rồi vào lỗ.",
    cue: "glide",
    judge: judgeBank,
    layouts: [
      {
        target: 1,
        balls: [{ id: 0, x: 0.05, z: -0.25 }, { id: 1, x: 0.45, z: -0.45 }],
      },
      {
        target: 1,
        balls: [{ id: 0, x: 0.15, z: -0.48 }, { id: 1, x: -0.25, z: -0.6 }],
      },
      {
        target: 1,
        balls: [{ id: 0, x: 0.3, z: 0.2 }, { id: 1, x: -0.2, z: 0.55 }],
      },
    ],
  },
  kick: {
    id: "kick",
    name: "Đá băng",
    goal: "Đá băng: bi cái chạm băng trước rồi mới chạm bi 1.",
    cue: "glide",
    judge: judgeKick,
    layouts: [
      {
        target: 1,
        balls: [
          { id: 0, x: 0, z: 0.45 },
          { id: 1, x: 0, z: -0.45 },
          { id: 2, x: 0, z: 0 },
        ],
      },
      {
        target: 1,
        balls: [
          { id: 0, x: -0.3, z: 0.3 },
          { id: 1, x: 0.25, z: -0.6 },
          { id: 2, x: -0.08, z: -0.06 },
          { id: 3, x: 0.085, z: -0.33 },
        ],
      },
      {
        target: 1,
        balls: [
          { id: 0, x: 0.2, z: -0.2 },
          { id: 1, x: -0.25, z: -1.0 },
          { id: 2, x: -0.02, z: -0.6 },
        ],
      },
    ],
  },
  jump: {
    id: "jump",
    name: "Nhảy bi",
    goal: "Nhảy bi: bay qua bi chắn, chạm bi 1 trước và đưa nó vào lỗ góc.",
    cue: "jump",
    judge: potJudge("bay qua bi chắn và vào lỗ."),
    layouts: [
      // Bi chắn 25, 18 and 13 cm from the cue ball on one diagonal.
      {
        target: 1,
        balls: [
          { id: 0, x: 0.052, z: -0.583 },
          { id: 1, x: -0.408, z: -1.043 },
          { id: 2, x: -0.125, z: -0.76 },
        ],
      },
      {
        target: 1,
        balls: [
          { id: 0, x: -0.019, z: -0.654 },
          { id: 1, x: -0.408, z: -1.043 },
          { id: 2, x: -0.146, z: -0.781 },
        ],
      },
      {
        target: 1,
        balls: [
          { id: 0, x: -0.068, z: -0.703 },
          { id: 1, x: -0.408, z: -1.043 },
          { id: 2, x: -0.16, z: -0.795 },
        ],
      },
    ],
  },
  cut: {
    id: "cut",
    name: "Cắt mỏng",
    goal: "Cắt mỏng: cắt bi 1 vào lỗ với góc rất mỏng.",
    cue: "glide",
    judge: potJudge("cắt mỏng vào lỗ."),
    layouts: [
      // About 60°, 65° and 70° of cut: two corners, then a side pocket.
      {
        target: 1,
        balls: [{ id: 0, x: 0.279, z: -0.891 }, { id: 1, x: -0.3, z: -0.85 }],
      },
      {
        target: 1,
        balls: [{ id: 0, x: -0.173, z: -1.06 }, { id: 1, x: 0.45, z: -1.0 }],
      },
      {
        target: 1,
        balls: [{ id: 0, x: -0.112, z: -0.227 }, { id: 1, x: 0.25, z: 0.15 }],
      },
    ],
  },
  position: {
    id: "position",
    name: "Về vị trí",
    goal: "Về vị trí: vào bi 1 và để bi cái dừng trong vòng sáng.",
    cue: "glide",
    judge: judgePosition,
    layouts: [
      // Stop the cue ball where it met bi 1, then draw it back, then
      // follow a cut along the foot of the table.
      {
        target: 1,
        balls: [{ id: 0, x: -0.02, z: -0.23 }, { id: 1, x: 0.4, z: -0.9 }],
        zone: { x: 0.369, z: -0.852, radius: 0.06 },
      },
      {
        target: 1,
        balls: [{ id: 0, x: 0.155, z: -0.523 }, { id: 1, x: 0.4, z: -0.9 }],
        zone: { x: 0.27, z: -0.745, radius: 0.09 },
      },
      {
        target: 1,
        balls: [{ id: 0, x: 0.1, z: -0.5 }, { id: 1, x: -0.45, z: -0.95 }],
        zone: { x: -0.3, z: -0.87, radius: 0.08 },
      },
    ],
  },
});

export const DRILL_IDS: readonly DrillId[] = ["bank", "kick", "jump", "cut", "position"];
