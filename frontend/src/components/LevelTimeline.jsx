import { getLevelPeriods } from "@/lib/levelHistory";

export const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];
const clayLevelColors = ["#93a4c4", "#e2793f", "#a98fcb", "#7fb088"];

// Horizontal stacked bar showing how many days a trainee has spent at each
// level in total (summed across every stint, so a promote/demote/re-promote
// cycle still counts correctly) - a quick visual answer to "how long did
// they sit at L0 vs L1" without opening the full history. Shared between
// the admin trainee card and the trainee's own progress view.
//
// variant="clay" renders the same segments as an inset "channel" with
// inlaid colored fills, for the claymorphism-styled Dashboard card. It's
// opt-in so the trainee-facing Home page keeps its plain default look.
export default function LevelTimeline({ trainee, variant = "default" }) {
  const daysPerLevel = getLevelPeriods(trainee).reduce((acc, p) => {
    acc[p.level] = (acc[p.level] || 0) + p.days;
    return acc;
  }, {});
  const segments = [0, 1, 2, 3]
    .filter((lvl) => daysPerLevel[lvl] > 0)
    .map((lvl) => ({ level: lvl, days: daysPerLevel[lvl] }));
  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
  if (totalDays === 0) return null;

  if (variant === "clay") {
    return (
      <div className="mb-3">
        <div className="clay-track flex h-5 p-[3px] gap-[3px]">
          {segments.map((s) => (
            <div
              key={s.level}
              className="clay-track-fill flex items-center justify-center text-[9.5px] font-bold text-white whitespace-nowrap overflow-hidden"
              style={{ width: `${(s.days / totalDays) * 100}%`, backgroundColor: clayLevelColors[s.level] }}
              title={`Level ${s.level}: ${s.days} day${s.days === 1 ? "" : "s"}`}
            >
              L{s.level}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          {segments.map((s) => (
            <span key={s.level} className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--clay-faint)" }}>
              <span
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: clayLevelColors[s.level] }}
              />
              L{s.level} · {s.days}d
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="flex h-6 rounded-lg overflow-hidden ring-1 ring-neutral-200 bg-neutral-100">
        {segments.map((s) => (
          <div
            key={s.level}
            className="flex items-center justify-center text-[10px] font-semibold text-white whitespace-nowrap overflow-hidden"
            style={{ width: `${(s.days / totalDays) * 100}%`, backgroundColor: levelColors[s.level] }}
            title={`Level ${s.level}: ${s.days} day${s.days === 1 ? "" : "s"}`}
          >
            L{s.level} · {s.days}d
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {segments.map((s) => (
          <span key={s.level} className="inline-flex items-center gap-1 text-[10px] text-neutral-400">
            <span
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: levelColors[s.level] }}
            />
            L{s.level} · {s.days}d
          </span>
        ))}
      </div>
    </div>
  );
}
