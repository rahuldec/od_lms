import { getLevelPeriods } from "@/lib/levelHistory";

export const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];
// Sampled from the Okie Dokie logo: warm neutral for the not-yet-reached
// base, then orange -> maroon -> gold for L1-L3, echoing the logo's own
// ring/badge/star colors.
const glass3dLevelColors = ["#c9b8a0", "#ed601f", "#811a0f", "#c99a2e"];

// Horizontal stacked bar showing how many days a trainee has spent at each
// level in total (summed across every stint, so a promote/demote/re-promote
// cycle still counts correctly) - a quick visual answer to "how long did
// they sit at L0 vs L1" without opening the full history. Shared between
// the admin trainee card and the trainee's own progress view.
//
// variant="glass3d" renders the same segments in a translucent glass
// track, with a glow on the current (last) segment, for the Glass + 3D
// styled Dashboard card. It's opt-in so the trainee-facing Home page
// keeps its plain default look.
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

  if (variant === "glass3d") {
    const lastLevel = segments[segments.length - 1]?.level;
    return (
      <div className="mb-3">
        <div className="g3d-track flex h-5">
          {segments.map((s) => (
            <div
              key={s.level}
              className="g3d-track-fill flex items-center justify-center text-[9.5px] font-bold text-white whitespace-nowrap overflow-hidden"
              style={{
                width: `${(s.days / totalDays) * 100}%`,
                backgroundColor: glass3dLevelColors[s.level],
                boxShadow: s.level === lastLevel ? `0 0 8px ${glass3dLevelColors[s.level]}` : "none",
              }}
              title={`Level ${s.level}: ${s.days} day${s.days === 1 ? "" : "s"}`}
            >
              L{s.level}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          {segments.map((s) => (
            <span key={s.level} className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--g3d-faint)" }}>
              <span
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: glass3dLevelColors[s.level] }}
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
