import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import { fetchSheetModules } from "@/lib/sheet";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, X, BarChart3, Layers, Flag, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from "recharts";

const Stat = ({ icon: Icon, label, value, testId }) => (
  <Card data-testid={testId} className="rounded-2xl border-neutral-200/80 p-6 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">{label}</p>
        <p className="text-4xl font-semibold mt-3 text-neutral-900 tabular-nums">{value}</p>
      </div>
      <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </Card>
);

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
  { to: "/admin/results", label: "Results", testId: "nav-results" },
];

const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];

// Palette for per-trainee bars in the module comparison chart. Cycled if more
// trainees than colors.
const TRAINEE_COLORS = [
  "#E05A2B", "#16a34a", "#2563eb", "#9333ea", "#0891b2",
  "#ca8a04", "#dc2626", "#4f46e5", "#0d9488", "#db2777",
];

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const daysSince = (iso) => {
  if (!iso) return null;
  const joined = new Date(iso);
  const today = new Date();
  joined.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - joined) / (1000 * 60 * 60 * 24));
  return diff;
};

function AssignmentModal({ assignment, onClose }) {
  if (!assignment) return null;
  const color = assignment.passed ? "#16a34a" : "#dc2626";
  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Assignment</p>
            <p className="font-semibold text-lg">{assignment.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 font-semibold"
              style={{ borderColor: color + "40", backgroundColor: color + "10", color: color }}
            >
              {assignment.score}/{assignment.total} {assignment.passed ? "Pass" : "Fail"}
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full hover:bg-neutral-100 grid place-items-center"
            >
              <X className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
        </div>

        {assignment.link && (
          <div className="px-6 py-3 bg-neutral-50 border-b border-neutral-100">
            <a
              href={assignment.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
            >
              View Recording
            </a>
          </div>
        )}

        <div className="overflow-y-auto max-h-[60vh] px-6 py-4 space-y-4">
          {(assignment.qa || []).map((item, i) => (
            <div key={i} className="border border-neutral-100 rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-1">Q{i + 1}</p>
              <p className="text-sm font-medium text-neutral-800 mb-2">{item.question}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-neutral-400">Answer:</span>
                <span
                  className="text-sm font-semibold"
                  style={{
                    color: item.answer === "Yes" ? "#16a34a" : item.answer === "No" ? "#dc2626" : "#374151",
                  }}
                >
                  {item.answer || "-"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Custom tooltip for the module comparison chart - lists every trainee's score
// for the hovered module, sorted highest first. Colors each score red/green
// based on the passing mark (9) and shows the module's total when available.
const PASSING_MARK = 9;

// Custom tooltip for the trainee-wise performance chart - lists every
// module's score for the hovered trainee, plus their overall average %.
function TraineePerformanceTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const avgPct = payload[0]?.payload?.avgPct;
  const rows = payload.filter(
    (p) => p.dataKey !== "avgPct" && p.value !== undefined && p.value !== null
  );
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-lg px-4 py-3 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold text-neutral-800">{label}</p>
        {avgPct != null && <p className="text-xs text-neutral-400">avg {avgPct}%</p>}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.dataKey} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
            <span className="text-neutral-600 truncate">{r.dataKey}</span>
            <span className="ml-auto font-medium tabular-nums text-neutral-800">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleComparisonTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload[0]?.payload?.total;
  const rows = payload
    .filter((p) => p.dataKey !== "total" && p.value !== undefined && p.value !== null)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-lg px-4 py-3 max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold text-neutral-800">{label}</p>
        {total != null && <p className="text-xs text-neutral-400">out of {total}</p>}
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const passed = r.value >= PASSING_MARK;
          return (
            <div key={r.dataKey} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-neutral-600 truncate">{r.dataKey}</span>
              <span
                className="ml-auto font-medium tabular-nums"
                style={{ color: passed ? "#16a34a" : "#dc2626" }}
              >
                {total != null ? `${r.value}/${total}` : r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Read-only summary widget for the dashboard: for every batch, show which
// modules are currently assigned (visible to trainees) and which one the
// batch is actively on. Editing assignments / current module happens on the
// Batch Detail page — this is just a quick at-a-glance overview across all
// batches.
function BatchModulesPanel({ batches, trainees }) {
  const [loading, setLoading] = useState(true);
  const [assignmentsByBatch, setAssignmentsByBatch] = useState({});
  const [moduleOrder, setModuleOrder] = useState([]);

  // Curriculum order, fetched once, used so every batch lists its modules in
  // the same sequence instead of whatever order they happened to be saved in.
  useEffect(() => {
    (async () => {
      try {
        const mods = await fetchSheetModules();
        setModuleOrder((mods || []).map((m) => m.name));
      } catch {
        setModuleOrder([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (batches.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const map = {};
      await Promise.all(
        batches.map(async (b) => {
          try {
            const rows = await api.getBatchModules(b.id);
            map[b.id] = (rows || []).map((row) => row.module_name);
          } catch {
            map[b.id] = [];
          }
        })
      );
      if (!cancelled) {
        setAssignmentsByBatch(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batches]);

  const sortByCurriculum = (names) => {
    if (moduleOrder.length === 0) return names;
    return [...names].sort(
      (a, b2) => moduleOrder.indexOf(a) - moduleOrder.indexOf(b2)
    );
  };

  // Batch 0 is a catch-all / pre-onboarding bucket, not a real sequential
  // batch, so it should always render last regardless of its numeric name.
  const sortedBatches = [...batches].sort((a, b2) => {
    if (a.name === "Batch 0") return 1;
    if (b2.name === "Batch 0") return -1;
    return a.name.localeCompare(b2.name, undefined, { numeric: true });
  });

  const traineesByBatch = useMemo(() => {
    const map = {};
    (trainees || []).forEach((t) => {
      if (!t.batch_id) return;
      if (!map[t.batch_id]) map[t.batch_id] = [];
      map[t.batch_id].push(t.name);
    });
    return map;
  }, [trainees]);

  return (
    <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-4 w-4 text-neutral-400" />
        <h2 className="text-xl font-semibold">Modules assigned per batch</h2>
      </div>
      <p className="text-sm text-neutral-500 mb-5">
        What each batch currently sees, in curriculum order. The flagged module is what the batch is currently on. Manage from a batch's detail page.
      </p>

      {batches.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No batches yet. Create one from the Batches page first.
        </p>
      ) : loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {sortedBatches.map((b) => {
            const names = sortByCurriculum(assignmentsByBatch[b.id] || []);
            return (
              <div key={b.id} className="py-3.5 flex items-start gap-4 first:pt-0 last:pb-0">
                <Link
                  to={`/admin/batches/${b.id}`}
                  className="text-sm font-medium text-neutral-800 hover:underline shrink-0 w-28"
                >
                  {b.name}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {names.length === 0 ? (
                      <span className="text-sm text-neutral-400">No modules assigned</span>
                    ) : (
                      names.map((name) => {
                        const isCurrent = b.current_module === name;
                        return (
                          <Badge
                            key={name}
                            variant="secondary"
                            className={`rounded-full font-medium inline-flex items-center gap-1 ${
                              isCurrent ? "ring-1 ring-[#E05A2B]" : ""
                            }`}
                            style={
                              isCurrent
                                ? { backgroundColor: "#E05A2B", color: "white" }
                                : { backgroundColor: "#FFF0E8", color: "#E05A2B" }
                            }
                          >
                            {isCurrent && <Flag className="h-3 w-3" />}
                            {name}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  {(traineesByBatch[b.id] || []).length > 0 && (
                    <p className="mt-1.5 text-xs text-neutral-400">
                      <span className="text-neutral-500">Trainees:</span>{" "}
                      {traineesByBatch[b.id].join(", ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function AdminDashboard() {
  const [trainees, setTrainees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [assignmentResults, setAssignmentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [results, setResults] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [data, aResults, batchData, resultsData] = await Promise.all([
          api.listTrainees(),
          fetchAllAssignmentResults().catch(() => ({})),
          api.listBatches().catch(() => []),
          api.listResultsAdmin().catch(() => []),
        ]);
        setTrainees(Array.isArray(data) ? data : []);
        setAssignmentResults(aResults || {});
        setBatches(Array.isArray(batchData) ? batchData : []);
        setResults(Array.isArray(resultsData) ? resultsData.filter((r) => r.published).slice(0, 3) : []);
      } catch (e) {
        toast.error("Could not load trainees");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const batchNameById = useMemo(() => {
    const map = {};
    batches.forEach((b) => (map[b.id] = b.name));
    return map;
  }, [batches]);

  const filteredTrainees = useMemo(() => {
    const notExited = trainees.filter((t) => t.status !== "Exited");
    if (selectedBatch === "all") return notExited;
    if (selectedBatch === "none") return notExited.filter((t) => !t.batch_id);
    return notExited.filter((t) => t.batch_id === selectedBatch);
  }, [trainees, selectedBatch]);

  const total = filteredTrainees.length;
  const active = filteredTrainees.filter((t) => t.status === "Active").length;
  const onHold = filteredTrainees.filter((t) => t.status === "On Hold").length;

  const levelGroups = [0, 1, 2, 3].map((lvl) => ({
    level: lvl,
    trainees: filteredTrainees.filter((t) => (t.current_level ?? 0) === lvl),
  }));

  const now = new Date();
  const promotionsThisMonth = filteredTrainees.reduce((acc, t) => {
    const history = Array.isArray(t.history) ? t.history : [];
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
  }, 0);

  // Stable across renders unless assignmentResults itself changes, so it's
  // safe to include in dependency arrays (e.g. moduleComparison below)
  // without causing infinite re-renders or breaking memoization.
  const getAssignments = useCallback(
    (name) => {
      if (!name) return [];
      return assignmentResults[name.trim().toLowerCase()] || [];
    },
    [assignmentResults]
  );

  // ---- Module-wise comparison of trainees ----------------------------
  // Reshapes assignmentResults (keyed by trainee name) into one row per
  // module, with each trainee's score as its own key, plus a "total" field
  // (max possible score for that module) used to draw a pass-line reference.
  // e.g. [{ module: "SIS", total: 15, "Rahul": 8, "Sultan": 9 }, ...]
  const moduleComparison = useMemo(() => {
    const moduleNames = new Set();
    const rowsByModule = {};

    filteredTrainees.forEach((t) => {
      const assignments = getAssignments(t.name);
      assignments.forEach((a) => {
        if (!a?.name) return;
        moduleNames.add(a.name);
        if (!rowsByModule[a.name]) rowsByModule[a.name] = { module: a.name, total: a.total ?? null };
        rowsByModule[a.name][t.name] = a.score ?? null;
        if (rowsByModule[a.name].total == null && a.total != null) {
          rowsByModule[a.name].total = a.total;
        }
      });
    });

    // Order trainees by their average score across modules (highest first)
    // so the strongest performers' bars consistently appear first in every
    // group, making cross-module comparison easier at a glance.
    const traineeAverages = filteredTrainees
      .map((t) => {
        const scores = Array.from(moduleNames)
          .map((m) => rowsByModule[m]?.[t.name])
          .filter((v) => v != null);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : -1;
        return { name: t.name, avg, hasData: scores.length > 0 };
      })
      .filter((t) => t.hasData)
      .sort((a, b) => b.avg - a.avg);

    return {
      data: Array.from(moduleNames).map((m) => rowsByModule[m]),
      traineeNames: traineeAverages.map((t) => t.name),
    };
  }, [filteredTrainees, getAssignments]);

  // ---- Trainee-wise performance (same data as moduleComparison, pivoted) --
  // One row per trainee, one bar per module, plus an overall avgPct (score
  // sum / total sum across every module with a recorded total) and pass
  // count, used to rank trainees and surface their weakest module.
  const traineePerformance = useMemo(() => {
    const moduleNamesSet = new Set();

    const rows = filteredTrainees
      .map((t) => {
        const assignments = getAssignments(t.name);
        const row = { name: t.name };
        let scoreSum = 0;
        let totalSum = 0;
        let passedCount = 0;
        let strongestModule = null;
        let strongestRatio = -Infinity;

        assignments.forEach((a) => {
          if (!a?.name) return;
          moduleNamesSet.add(a.name);
          row[a.name] = a.score ?? null;
          if (a.score != null && a.total != null) {
            scoreSum += a.score;
            totalSum += a.total;
            const ratio = a.total > 0 ? a.score / a.total : 0;
            if (ratio > strongestRatio) {
              strongestRatio = ratio;
              strongestModule = a.name;
            }
          }
          if (a.passed) passedCount += 1;
        });

        return {
          ...row,
          avgPct: totalSum > 0 ? Math.round((scoreSum / totalSum) * 100) : null,
          passedCount,
          moduleCount: assignments.length,
          strongestModule,
        };
      })
      .filter((r) => r.moduleCount > 0)
      .sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1));

    return { data: rows, moduleNames: Array.from(moduleNamesSet) };
  }, [filteredTrainees, getAssignments]);

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Overview</p>
        <h1 className="text-4xl font-semibold mt-1 tracking-tight">Training operations</h1>
        <p className="text-neutral-500 mt-2 max-w-xl">
          A snapshot of where every trainee stands, who needs attention, and who is ready for the next level.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat testId="stat-total" icon={Users} label="Total trainees" value={loading ? "-" : total} />
        <Stat testId="stat-active" icon={CheckCircle2} label="Active" value={loading ? "-" : active} />
        <Stat testId="stat-onhold" icon={PauseCircle} label="On hold" value={loading ? "-" : onHold} />
        <Stat testId="stat-promotions" icon={TrendingUp} label="Promotions this month" value={loading ? "-" : promotionsThisMonth} />
      </div>

      {results.length > 0 && (
        <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Latest results</p>
            <Link to="/admin/results" className="text-xs font-semibold" style={{ color: "#E05A2B" }}>
              Manage results &rarr;
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {results.map((r) => (
              <a
                key={r.id}
                href={r.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg grid place-items-center flex-shrink-0" style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}>
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate max-w-[220px]">{r.title}</p>
                  <p className="text-xs text-neutral-500">{r.cycle || new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-neutral-500">Filter by batch</p>
        <select
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
          className="text-sm border border-neutral-200 rounded-full px-4 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
        >
          <option value="all">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="none">No batch assigned</option>
        </select>
      </div>

      {/* Quick module assignment per batch */}
      <BatchModulesPanel batches={batches} trainees={trainees.filter((t) => t.status !== "Exited")} />

      {/* Module-wise comparison of trainees */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-neutral-400" />
          <h2 className="text-xl font-semibold">Module-wise comparison</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-6">
          Every trainee's score side by side, grouped by module and sorted by average performance. Hover a bar group to see the full breakdown.
        </p>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading...</p>
        ) : moduleComparison.data.length === 0 ? (
          <p className="text-sm text-neutral-400">No assignment scores recorded yet.</p>
        ) : (
          <div style={{ width: "100%", height: 380 }}>
            <ResponsiveContainer>
              <BarChart
                data={moduleComparison.data}
                margin={{ top: 24, right: 10, left: 0, bottom: 10 }}
                barCategoryGap="28%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                <XAxis dataKey="module" tick={{ fontSize: 12, fill: "#737373" }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#737373" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <ReferenceLine
                  y={PASSING_MARK}
                  stroke="#d4d4d4"
                  strokeDasharray="4 4"
                  label={{ value: `Pass (${PASSING_MARK})`, position: "right", fontSize: 11, fill: "#a3a3a3" }}
                />
                <Tooltip content={<ModuleComparisonTooltip />} cursor={{ fill: "#fafafa" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                {moduleComparison.traineeNames.map((name, i) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    fill={TRAINEE_COLORS[i % TRAINEE_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  >
                    <LabelList
                      dataKey={name}
                      position="top"
                      fontSize={10}
                      fill="#a3a3a3"
                      formatter={(v) => (v != null ? v : "")}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Trainee-wise performance: same scores, pivoted to rank trainees */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-neutral-400" />
          <h2 className="text-xl font-semibold">Trainee-wise performance</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-6">
          Every trainee's scores across all modules, ranked by overall average. Hover a bar group for the full breakdown.
        </p>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading...</p>
        ) : traineePerformance.data.length === 0 ? (
          <p className="text-sm text-neutral-400">No assignment scores recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                    <th className="py-2 pr-4 font-medium">Rank</th>
                    <th className="py-2 pr-4 font-medium">Trainee</th>
                    <th className="py-2 pr-4 font-medium">Avg %</th>
                    <th className="py-2 pr-4 font-medium">Passed</th>
                    <th className="py-2 pr-4 font-medium">Strongest module</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {traineePerformance.data.map((row, i) => (
                    <tr key={row.name}>
                      <td className="py-2.5 pr-4 text-neutral-400 tabular-nums">{i + 1}</td>
                      <td className="py-2.5 pr-4 font-medium text-neutral-800">{row.name}</td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {row.avgPct != null ? (
                          <span
                            className="font-medium"
                            style={{ color: row.avgPct >= 60 ? "#16a34a" : "#dc2626" }}
                          >
                            {row.avgPct}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-600 tabular-nums">
                        {row.passedCount}/{row.moduleCount}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-600">
                        {row.strongestModule || <span className="text-neutral-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </Card>

      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Level distribution</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Click a level to see trainees, assignment scores and promotion history.
            </p>
          </div>
          <span className="text-sm text-neutral-400">{total} total</span>
        </div>

        <div className="space-y-4">
          {levelGroups.map(({ level, trainees: lvlTrainees }) => {
            const pct = total ? Math.round((lvlTrainees.length / total) * 100) : 0;
            const isExpanded = expandedLevel === level;
            return (
              <div key={level} className="border border-neutral-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedLevel(isExpanded ? null : level)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
                >
                  <div
                    className="h-8 w-8 rounded-full grid place-items-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: levelColors[level] }}
                  >
                    L{level}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-neutral-900">Level {level}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {lvlTrainees.length} trainees - {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: levelColors[level] }}
                      />
                    </div>
                  </div>
                  {lvlTrainees.length > 0 && (
                    isExpanded
                      ? <ChevronUp className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && lvlTrainees.length > 0 && (
                  <div className="border-t border-neutral-100 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {lvlTrainees.map((t) => {
                        const history = Array.isArray(t.history) ? t.history : [];
                        const promotions = history.filter((h) => h.type === "promotion");
                        const assignments = getAssignments(t.name);
                        const days = daysSince(t.join_date);
                        const latestPromotion = promotions[promotions.length - 1];
                        return (
                          <div
                            key={t.id}
                            className="relative border border-neutral-200 rounded-xl p-3.5 hover:shadow-sm hover:border-neutral-300 transition-all bg-white overflow-hidden"
                          >
                            {days !== null && (
                              <div
                                className="absolute -top-2 -right-1 select-none pointer-events-none leading-none font-black tracking-tighter"
                                style={{
                                  fontSize: "3.75rem",
                                  color: "#E05A2B",
                                  opacity: 0.07,
                                }}
                              >
                                {days}
                              </div>
                            )}
                            <div className="relative flex items-start justify-between mb-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="h-8 w-8 rounded-full grid place-items-center text-white text-xs font-semibold flex-shrink-0"
                                  style={{ backgroundColor: "#E05A2B" }}
                                >
                                  {t.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    to={`/admin/trainees/${t.id}`}
                                    className="text-sm font-medium text-neutral-900 hover:underline truncate block"
                                  >
                                    {t.name}
                                  </Link>
                                  <p className="text-xs text-neutral-400 truncate">
                                    @{t.username}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 mb-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
                                  t.status === "Active"
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    : "bg-neutral-100 text-neutral-600 ring-neutral-200"
                                }`}
                              >
                                {t.status}
                              </span>
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
                              >
                                L{t.current_level ?? 0}
                              </span>
                              {t.batch_id && batchNameById[t.batch_id] && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 ring-1 ring-blue-200">
                                  {batchNameById[t.batch_id]}
                                </span>
                              )}
                              {latestPromotion && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-neutral-400 ml-auto">
                                  <TrendingUp className="h-2.5 w-2.5" />
                                  {fmtDate(latestPromotion.at)}
                                </span>
                              )}
                            </div>

                            {assignments.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {assignments.map((a) => {
                                  const color = a.passed ? "#16a34a" : "#dc2626";
                                  const pct = a.total ? Math.min(100, Math.round((a.score / a.total) * 100)) : 0;
                                  return (
                                    <button
                                      key={a.id}
                                      onClick={() => setActiveAssignment(a)}
                                      className="text-left hover:opacity-80 transition-opacity"
                                    >
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[11px] text-neutral-500">{a.name}</span>
                                        <span className="text-[11px] font-medium" style={{ color }}>
                                          {a.score}/{a.total} {a.passed ? "Pass" : "Fail"}
                                        </span>
                                      </div>
                                      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full rounded-full"
                                          style={{ width: `${pct}%`, backgroundColor: color }}
                                        />
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-neutral-400">No assignments yet</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isExpanded && lvlTrainees.length === 0 && (
                  <div className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-400">
                    No trainees at this level.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <AssignmentModal assignment={activeAssignment} onClose={() => setActiveAssignment(null)} />
    </AppShell>
  );
}
