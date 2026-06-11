import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, CheckCircle2, PauseCircle } from "lucide-react";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, accent, testId }) => (
<Card
data-testid={testId}
className="rounded-2xl border-neutral-200/80 p-6 hover:shadow-sm transition-shadow"

>

```
<div className="flex items-start justify-between">
```

```
  <div>
    <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
      {label}
    </p>
    <p className="text-4xl font-semibold mt-3 text-neutral-900 tabular-nums">
      {value}
    </p>
  </div>
  <div
    className="h-9 w-9 rounded-xl grid place-items-center"
    style={{ backgroundColor: accent || "#FFF0E8", color: "#E05A2B" }}
  >
    <Icon className="h-5 w-5" />
  </div>
</div>
```

  </Card>
);

const LevelBar = ({ level, count, total }) => {
const pct = total ? Math.round((count / total) * 100) : 0;

return (
<div data-testid={`level-bar-${level}`}> <div className="flex items-center justify-between text-sm mb-2"> <span className="font-medium text-neutral-900">
Level {level} </span> <span className="text-neutral-500 tabular-nums">
{count} <span className="text-neutral-300">·</span> {pct}% </span> </div>

```
  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
    <div
      className="h-full rounded-full transition-all"
      style={{
        width: `${pct}%`,
        backgroundColor: "#E05A2B",
      }}
    />
  </div>
</div>
```

);
};

const navItems = [
{ to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
{ to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
];

export default function AdminDashboard() {
const [trainees, setTrainees] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
(async () => {
try {
const data = await api.listTrainees();
setTrainees(Array.isArray(data) ? data : []);
} catch (e) {
toast.error("Could not load trainees");
} finally {
setLoading(false);
}
})();
}, []);

const total = trainees.length;
const active = trainees.filter((t) => t.status === "Active").length;
const onHold = trainees.filter((t) => t.status === "On Hold").length;

const levelCounts = [0, 1, 2, 3].map(
(lvl) => trainees.filter((t) => (t.current_level ?? 0) === lvl).length
);

const traineesByLevel = [0, 1, 2, 3].map((lvl) =>
trainees.filter((t) => (t.current_level ?? 0) === lvl)
);

const now = new Date();

const promotionsThisMonth = trainees.reduce((acc, t) => {
const history = Array.isArray(t.history) ? t.history : [];

```
const inMonth = history.some((h) => {
  if (!h?.at) return false;

  const d = new Date(h.at);

  return (
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear() &&
    h.type === "promotion"
  );
});

return acc + (inMonth ? 1 : 0);
```

}, 0);

return ( <AppShell navItems={navItems} subtitle="Admin"> <div className="mb-8"> <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
Overview </p>

```
    <h1 className="text-4xl font-semibold mt-1 tracking-tight">
      Training operations
    </h1>

    <p className="text-neutral-500 mt-2 max-w-xl">
      A snapshot of where every trainee stands, who needs attention, and
      who's ready for the next level.
    </p>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
    <Stat
      testId="stat-total"
      icon={Users}
      label="Total trainees"
      value={loading ? "—" : total}
    />
    <Stat
      testId="stat-active"
      icon={CheckCircle2}
      label="Active"
      value={loading ? "—" : active}
    />
    <Stat
      testId="stat-onhold"
      icon={PauseCircle}
      label="On hold"
      value={loading ? "—" : onHold}
    />
    <Stat
      testId="stat-promotions"
      icon={TrendingUp}
      label="Promotions this month"
      value={loading ? "—" : promotionsThisMonth}
    />
  </div>

  <Card className="rounded-2xl border-neutral-200/80 p-7">
    <div className="flex items-baseline justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold">Level distribution</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Where trainees currently sit, Level 0 → Level 3.
        </p>
      </div>
      <span className="text-sm text-neutral-400">{total} total</span>
    </div>

    <div className="space-y-5">
      {levelCounts.map((c, i) => (
        <LevelBar key={i} level={i} count={c} total={total} />
      ))}
    </div>
  </Card>

  <Card className="rounded-2xl border-neutral-200/80 p-7 mt-6">
    <div className="mb-6">
      <h2 className="text-xl font-semibold">
        Level-wise Trainees
      </h2>

      <p className="text-sm text-neutral-500 mt-1">
        Current trainees grouped by level.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {traineesByLevel.map((levelTrainees, level) => (
        <div
          key={level}
          className="border border-neutral-200 rounded-xl p-4"
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">
              Level {level}
            </h3>

            <span className="text-sm text-neutral-500">
              {levelTrainees.length}
            </span>
          </div>

          {levelTrainees.length === 0 ? (
            <p className="text-sm text-neutral-400">
              No trainees
            </p>
          ) : (
            <div className="space-y-2">
              {levelTrainees.map((trainee) => (
                <div
                  key={trainee.id}
                  className="bg-neutral-50 rounded-lg px-3 py-2 text-sm"
                >
                  {trainee.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  </Card>
</AppShell>
```

);
}
