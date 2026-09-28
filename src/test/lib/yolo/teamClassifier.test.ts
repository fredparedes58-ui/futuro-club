/**
 * VITAS · TeamClassifier — team split by kit colour, label stability, pruning.
 *
 * Kit colour only (torso crop), never the face (.claude/rules/identidad.md).
 * Synthetic patches (kitPatches.ts) — fixtures, not ground truth.
 */
import { describe, it, expect } from "vitest";
import { TeamClassifier, type TeamLabel } from "@/lib/yolo/teamClassifier";
import { KITS, multiPlayerFrame, type RGB } from "./kitPatches";

interface Player { id: number; kit: RGB }

/** Feed every player at the given frame indices (multiples of frameInterval). */
function feed(clf: TeamClassifier, players: Player[], frames: number[]): void {
  for (const f of frames) {
    const { frame, bboxes } = multiPlayerFrame(
      players.map((p) => ({
        kit: p.kit,
        // Teammates differ by lighting and sensor noise, frame to frame.
        opts: { seed: p.id * 131 + f, shade: 0.8 + ((p.id * 7 + f) % 5) * 0.05, noise: 18 },
      })),
    );
    players.forEach((p, i) => clf.feedFrame(p.id, frame, bboxes[i], f));
  }
}

const FRAMES = [0, 5, 10, 15, 20, 25];

function team(ids: number[], kit: RGB): Player[] {
  return ids.map((id) => ({ id, kit }));
}

function labelsOf(clf: TeamClassifier, players: Player[]): Set<TeamLabel> {
  return new Set(players.map((p) => clf.getTeam(p.id)));
}

describe("TeamClassifier — separation by kit colour", () => {
  it("splits red vs blue (same saturation) into two teams", () => {
    const clf = new TeamClassifier();
    const red = team([1, 2, 3, 4, 5], KITS.red);
    const blue = team([6, 7, 8, 9, 10], KITS.blue);
    feed(clf, [...red, ...blue], FRAMES);
    clf.classify();

    const redLabels = labelsOf(clf, red);
    const blueLabels = labelsOf(clf, blue);
    expect(redLabels.size).toBe(1);
    expect(blueLabels.size).toBe(1);
    const [r] = [...redLabels];
    const [b] = [...blueLabels];
    expect(["home", "away"]).toContain(r);
    expect(["home", "away"]).toContain(b);
    expect(r).not.toBe(b);
  });

  it("splits black vs white kits", () => {
    const clf = new TeamClassifier();
    const black = team([1, 2, 3, 4], KITS.black);
    const white = team([5, 6, 7, 8], KITS.white);
    feed(clf, [...black, ...white], FRAMES);
    clf.classify();
    const [k] = [...labelsOf(clf, black)];
    const [w] = [...labelsOf(clf, white)];
    expect(labelsOf(clf, black).size).toBe(1);
    expect(labelsOf(clf, white).size).toBe(1);
    expect(k).not.toBe(w);
    expect(["home", "away"]).toContain(k);
    expect(["home", "away"]).toContain(w);
  });

  it("a goalkeeper/referee seen first does not capture a team centroid", () => {
    const clf = new TeamClassifier();
    // Insertion order matters for seeding: odd kits first.
    const gk = team([100], KITS.yellow);
    const ref = team([101], KITS.black);
    const red = team([1, 2, 3, 4, 5, 6], KITS.red);
    const blue = team([7, 8, 9, 10, 11], KITS.blue);
    feed(clf, [...gk, ...ref, ...red, ...blue], FRAMES);
    clf.classify();

    const [r] = [...labelsOf(clf, red)];
    const [b] = [...labelsOf(clf, blue)];
    expect(labelsOf(clf, red).size).toBe(1);
    expect(labelsOf(clf, blue).size).toBe(1);
    expect(r).not.toBe(b);
    expect(["home", "away"]).toContain(r);
    expect(["home", "away"]).toContain(b);
    // Outliers are never folded into a team.
    expect(clf.getTeam(100)).not.toBe(r);
    expect(clf.getTeam(100)).not.toBe(b);
    expect(clf.getTeam(101)).not.toBe(r);
    expect(clf.getTeam(101)).not.toBe(b);
  });
});

describe("TeamClassifier — label stability across re-clustering", () => {
  it("a team keeps its label when the other team becomes the larger visible group", () => {
    const clf = new TeamClassifier();
    const white = team([1, 2, 3, 4, 5, 6], KITS.white);
    const blueFirst = team([7, 8, 9, 10], KITS.blue);
    feed(clf, [...white, ...blueFirst], FRAMES);
    clf.classify();
    const whiteLabel = clf.getTeam(1);
    const blueLabel = clf.getTeam(7);
    expect(whiteLabel).not.toBe(blueLabel);

    // Later in the match more blue players come into view: blue is now larger.
    const blueLater = team([11, 12, 13, 14, 15], KITS.blue);
    const later = FRAMES.map((f) => f + 30);
    feed(clf, [...white, ...blueFirst, ...blueLater], later);
    clf.classify();

    for (const p of white) expect(clf.getTeam(p.id)).toBe(whiteLabel);
    for (const p of [...blueFirst, ...blueLater]) expect(clf.getTeam(p.id)).toBe(blueLabel);
  });

  it("labels survive many re-classifications with changing track order", () => {
    const clf = new TeamClassifier();
    const red = team([1, 2, 3, 4, 5], KITS.red);
    const blue = team([6, 7, 8, 9], KITS.blue);
    feed(clf, [...red, ...blue], FRAMES);
    clf.classify();
    const redLabel = clf.getTeam(1);

    let nextId = 50;
    for (let round = 1; round <= 5; round++) {
      // New blue tracks appear first (fresh ByteTrack ids after occlusions).
      const newBlue = team([nextId++, nextId++, nextId++], KITS.blue);
      feed(clf, [...newBlue, ...red, ...blue], FRAMES.map((f) => f + round * 30));
      clf.classify();
      expect(clf.getTeam(1)).toBe(redLabel);
      for (const p of newBlue) expect(clf.getTeam(p.id)).not.toBe(redLabel);
    }
  });
});

describe("TeamClassifier — pruning of historical tracks", () => {
  it("forgets tracks not seen for maxStaleFrames, keeps live ones", () => {
    const clf = new TeamClassifier({ maxStaleFrames: 100 });
    // 60 short-lived tracks across the match (ByteTrack re-issues ids).
    for (let k = 0; k < 60; k++) {
      const start = k * 50;
      feed(clf, [{ id: 1000 + k, kit: k % 2 ? KITS.red : KITS.blue }], [start, start + 5]);
    }
    const live = [...team([1, 2], KITS.red), ...team([3, 4], KITS.blue)];
    const last = 60 * 50;
    feed(clf, live, [last, last + 5, last + 10, last + 15, last + 20, last + 25]);
    clf.classify();

    // Only tracks fed within the last 100 frames remain (the 4 live + the most recent short ones).
    expect(clf.trackedCount).toBeLessThanOrEqual(8);
    for (const p of live) expect(["home", "away"]).toContain(clf.getTeam(p.id));
    expect(clf.getTeam(1000)).toBe("unknown");
  });

  it("forgetTrack drops a single track", () => {
    const clf = new TeamClassifier();
    feed(clf, [...team([1, 2], KITS.red), ...team([3, 4], KITS.blue)], FRAMES);
    clf.classify();
    clf.forgetTrack(1);
    expect(clf.getTeam(1)).toBe("unknown");
    expect(clf.trackedCount).toBe(3);
  });
});
