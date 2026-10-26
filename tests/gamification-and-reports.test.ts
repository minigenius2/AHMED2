import { describe, expect, it } from "vitest";
import { buildWeeklyReport, levelForXp, newGamificationState, recordActivity } from "../src/index";
import { startTiny } from "./fixtures";

describe("gamification", () => {
  it("levels up at 150, 450, 900 XP", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(149).level).toBe(1);
    expect(levelForXp(150).level).toBe(2);
    expect(levelForXp(450).level).toBe(3);
    expect(levelForXp(900).level).toBe(4);
  });

  it("keeps the streak over one rest day but not two", () => {
    let g = newGamificationState();
    g = recordActivity(g, "2026-09-19");
    g = recordActivity(g, "2026-09-20");
    g = recordActivity(g, "2026-09-20");
    expect(g.streak.current).toBe(2);
    g = recordActivity(g, "2026-09-22");
    expect(g.streak.current).toBe(3);
    g = recordActivity(g, "2026-09-25");
    expect(g.streak).toMatchObject({ current: 1, best: 3 });
  });
});

describe("parent reports", () => {
  it("tells the parent when the week's lessons are not finished yet", () => {
    const j = startTiny();
    const report = buildWeeklyReport(j, 1, "2026-09-25");
    expect(report.kind).toBe("weekly_report");
    expect(report.text).toContain("خلّص 0 من 1");
    expect(report.text).toContain("لسه");
  });
});
