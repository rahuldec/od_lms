import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import { fetchSheetModules } from "@/lib/sheet";
import { getLevelPeriods, toDateOnly, daysBetween, daysAtCurrentLevel } from "@/lib/levelHistory";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  X,
  Briefcase,
  Layers,
  Rocket,
  MessageSquare,
  MapPin,
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronUp,
  Play,
  ArrowUp,
  ArrowDown,
  LogIn,
  FileText,
  BarChart3,
  Flag,
} from "lucide-react";
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

const ORANGE = "#E05A2B";

// Palette for per-trainee bars in the module comparison chart. Cycled if more
// trainees than colors.
const TRAINEE_COLORS = [
  "#E05A2B", "#16a34a", "#2563eb", "#9333ea", "#0891b2",
  "#ca8a04", "#dc2626", "#4f46e5", "#0d9488", "#db2777",
];

// Passing mark used to color scores in the module comparison chart/tooltip.
const PASSING_MARK = 9;

const relativeTime = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
};

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

// Read-only summary widget: for every batch, show which modules are
// currently assigned (visible to trainees) and which one the batch is
// actively on. Editing assignments / current module happens on the Batch
// Detail page - this is just a quick at-a-glance overview across all batches.
function BatchModulesPanel({ batches, trainees, open, onToggle }) {
  const [loading, setLoading] = useState(true);
  const [assignmentsByBatch, setAssignmentsByBatch] = useState({});
  const [moduleOrder, setModuleOrder] = useState([]);

  // Collapsed by default - nothing here fetches until the section is
  // expanded, since the module order comes from the sheet and the per-batch
  // assignments are one Supabase call per batch.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const mods = await fetchSheetModules();
        setModuleOrder((mods || []).map((m) => m.name));
      } catch {
        setModuleOrder([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, batches]);

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
    <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8 no-print">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-neutral-400" />
          <h2 className="text-xl font-semibold">Modules assigned per batch</h2>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-neutral-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-400" />
        )}
      </button>

      {open && (
        <>
          <p className="text-sm text-neutral-500 mt-1 mb-5">
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
        </>
      )}
    </Card>
  );
}

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees", group: "Roster" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches", group: "Roster" },
  { to: "/admin/assignment-schedule", label: "Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/analytics", label: "Analytics", testId: "nav-analytics" },
  { to: "/admin/clients", label: "Clients", testId: "nav-clients", group: "Content" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources", group: "Content" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules", group: "Content" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars", group: "Content" },
  { to: "/admin/results", label: "Results", testId: "nav-results", group: "Content" },
];

const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const todayStr = () => new Date().toISOString().slice(0, 10);

// Days a trainee is expected to spend at each level before it's worth
// flagging them as stuck - not a hard rule, just a prompt to go look.
const LEVEL_DAY_LIMITS = { 0: 30, 1: 60, 2: 60, 3: 60 };

/** [{trainee_id, ...}] -> { [traineeId]: [{...}] } */
const groupByTrainee = (rows) => {
  const map = {};
  (rows || []).forEach((r) => {
    if (!r?.trainee_id) return;
    if (!map[r.trainee_id]) map[r.trainee_id] = [];
    map[r.trainee_id].push(r);
  });
  return map;
};

export default function Reports() {
  const [trainees, setTrainees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [clientAssignments, setClientAssignments] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [sprintAssignments, setSprintAssignments] = useState([]);
  const [clientVisits, setClientVisits] = useState([]);
  const [assignmentResults, setAssignmentResults] = useState({});
  const [latestResults, setLatestResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailFor, setDetailFor] = useState(null);

  // Activity feed is the heaviest section (a live Google Sheet round trip
  // for lesson titles plus the feed itself), so it stays collapsed and
  // fetches only on first expand rather than on every Analytics page visit.
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFeed, setActivityFeed] = useState([]);
  const [sheetModules, setSheetModules] = useState([]);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const activityRequested = useRef(false);

  const [batchModulesOpen, setBatchModulesOpen] = useState(false);
  const [moduleComparisonOpen, setModuleComparisonOpen] = useState(false);
  const [traineePerfOpen, setTraineePerfOpen] = useState(false);

  const ensureActivityFeed = useCallback(async () => {
    if (activityRequested.current) return;
    activityRequested.current = true;
    setActivityLoading(true);
    try {
      const [feedData, modsData] = await Promise.all([
        api.listActivityFeed().catch(() => []),
        fetchSheetModules().catch(() => []),
      ]);
      setActivityFeed(Array.isArray(feedData) ? feedData : []);
      setSheetModules(Array.isArray(modsData) ? modsData : []);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [
          traineeData,
          batchData,
          resultsData,
          clientData,
          projectData,
          sprintData,
          visitData,
          assignmentData,
        ] = await Promise.all([
          api.listTrainees(),
          api.listBatches().catch(() => []),
          api.listResultsAdmin().catch(() => []),
          api.listClientAssignments().catch(() => []),
          api.listProjectAssignments().catch(() => []),
          api.listSprintAssignments().catch(() => []),
          api.listClientVisits().catch(() => []),
          fetchAllAssignmentResults().catch(() => ({})),
        ]);
        setTrainees(Array.isArray(traineeData) ? traineeData : []);
        setBatches(Array.isArray(batchData) ? batchData : []);
        setLatestResults(Array.isArray(resultsData) ? resultsData.filter((r) => r.published).slice(0, 3) : []);
        setClientAssignments(Array.isArray(clientData) ? clientData : []);
        setProjectAssignments(Array.isArray(projectData) ? projectData : []);
        setSprintAssignments(Array.isArray(sprintData) ? sprintData : []);
        setClientVisits(Array.isArray(visitData) ? visitData : []);
        setAssignmentResults(assignmentData || {});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const clientsByTrainee = useMemo(() => groupByTrainee(clientAssignments), [clientAssignments]);
  const projectsByTrainee = useMemo(() => groupByTrainee(projectAssignments), [projectAssignments]);
  const sprintsByTrainee = useMemo(() => groupByTrainee(sprintAssignments), [sprintAssignments]);
  const visitsByTrainee = useMemo(() => groupByTrainee(clientVisits), [clientVisits]);

  // One row per trainee who has reached Level 1 at some point, built from
  // level history rather than current_level - a trainee now at Level 2 was
  // still promoted to Level 1 on the way there, and that's the milestone
  // this report measures from.
  const { rows, notYetCount, l0Stats } = useMemo(() => {
    const today = todayStr();
    let notYet = 0;
    const stillAtL0Days = [];
    const built = trainees
      .map((t) => {
        const periods = getLevelPeriods(t, today);
        const l1Period = periods.find((p) => p.level === 1);
        if (!l1Period) {
          notYet += 1;
          stillAtL0Days.push(daysAtCurrentLevel(t, today));
          return null;
        }
        const l1Date = l1Period.start;
        // periods[0] is always the Level 0 stint - every trainee starts
        // there (see backend create_trainee) - and since l1Date is the
        // *first* time this trainee ever reached Level 1, that stint can't
        // have been interrupted by an earlier promotion/demotion round trip.
        const daysAtL0 = periods[0]?.level === 0 ? periods[0].days : daysBetween(periods[0]?.start || l1Date, l1Date);

        const clientRows = (clientsByTrainee[t.id] || [])
          .filter((c) => toDateOnly(c.assigned_at) >= l1Date)
          .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));

        const projectRows = (projectsByTrainee[t.id] || [])
          .filter((p) => toDateOnly(p.assigned_at) >= l1Date)
          .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));

        const sprintRows = (sprintsByTrainee[t.id] || [])
          .filter((s) => toDateOnly(s.assigned_at) >= l1Date)
          .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));
        const avgBugsPercent = sprintRows.length
          ? Math.round(
              sprintRows.reduce((sum, s) => sum + (s.bugs_percent || 0), 0) / sprintRows.length
            )
          : null;

        const visitRows = (visitsByTrainee[t.id] || []).filter((v) => v.visit_count > 0);
        const totalVisits = visitRows.reduce((sum, v) => sum + (v.visit_count || 0), 0);

        const assignments = assignmentResults[t.name.trim().toLowerCase()] || [];
        const passedCount = assignments.filter((a) => a.passed).length;

        const currentLevel = t.current_level ?? 0;
        const daysAtLevel = daysAtCurrentLevel(t, today);
        const levelLimit = LEVEL_DAY_LIMITS[currentLevel] ?? 60;
        const needsAttention = daysAtLevel > levelLimit;

        return {
          trainee: t,
          l1Date,
          daysAtL0,
          daysSinceL1: daysBetween(l1Date, today),
          clientRows,
          projectRows,
          sprintRows,
          avgBugsPercent,
          visitRows,
          totalVisits,
          assignments,
          passedCount,
          currentLevel,
          daysAtLevel,
          levelLimit,
          needsAttention,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.needsAttention - a.needsAttention) || (b.daysSinceL1 - a.daysSinceL1));

    const graduatedDays = built.map((r) => r.daysAtL0);
    const avgGraduated = graduatedDays.length
      ? Math.round(graduatedDays.reduce((sum, d) => sum + d, 0) / graduatedDays.length)
      : null;
    const avgStillAtL0 = stillAtL0Days.length
      ? Math.round(stillAtL0Days.reduce((sum, d) => sum + d, 0) / stillAtL0Days.length)
      : null;

    return {
      rows: built,
      notYetCount: notYet,
      l0Stats: {
        avgGraduated,
        graduatedCount: graduatedDays.length,
        avgStillAtL0,
        stillAtL0Count: stillAtL0Days.length,
      },
    };
  }, [
    trainees,
    clientsByTrainee,
    projectsByTrainee,
    sprintsByTrainee,
    visitsByTrainee,
    assignmentResults,
  ]);

  // Build lesson_id → title map from sheet modules, for the activity feed.
  const lessonTitleById = useMemo(() => {
    const map = {};
    sheetModules.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        map[l.id] = l.title;
      });
    });
    return map;
  }, [sheetModules]);

  const activeTrainees = useMemo(
    () => trainees.filter((t) => t.status !== "Exited"),
    [trainees]
  );

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

    activeTrainees.forEach((t) => {
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
    const traineeAverages = activeTrainees
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
  }, [activeTrainees, getAssignments]);

  // ---- Trainee-wise performance (same data as moduleComparison, pivoted) --
  // One row per trainee, one bar per module, plus an overall avgPct (score
  // sum / total sum across every module with a recorded total) and pass
  // count, used to rank trainees and surface their weakest module.
  const traineePerformance = useMemo(() => {
    const moduleNamesSet = new Set();

    const rows2 = activeTrainees
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

    return { data: rows2, moduleNames: Array.from(moduleNamesSet) };
  }, [activeTrainees, getAssignments]);

  const exportPdf = () => window.print();
  const attentionCount = rows.filter((r) => r.needsAttention).length;

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="mb-8 no-print">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Analytics</p>
        <h1 className="text-4xl font-semibold mt-1 tracking-tight">Training analytics</h1>
        <p className="text-neutral-500 mt-2 max-w-2xl">
          Activity, results, and performance across every trainee and batch.
        </p>
      </div>

      {/* ---- Activity Feed ---- */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8 no-print">
        <button
          onClick={() => {
            setActivityOpen((v) => !v);
            ensureActivityFeed();
          }}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-neutral-400" />
            <h2 className="text-xl font-semibold">Activity feed</h2>
          </div>
          <div className="flex items-center gap-3">
            {activityOpen && !activityLoading && (
              <span className="text-xs text-neutral-400">{activityFeed.length} recent events</span>
            )}
            {activityOpen ? (
              <ChevronUp className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        </button>

        {activityOpen && (
          <div className="mt-5">
          {activityLoading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : activityFeed.length === 0 ? (
            <p className="text-sm text-neutral-400">No activity yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-50">
                {(feedExpanded ? activityFeed : activityFeed.slice(0, 20)).map((ev, i) => {
                  const isWatch = ev.type === "watch";
                  const isPromo = ev.type === "promotion";
                  const isDemote = ev.type === "demotion";
                  const isLogin = ev.type === "login";

                  const iconBg = isWatch ? "#E1F5EE" : isPromo ? "#FFF0E8" : isLogin ? "#EAF1FE" : "#F1F5F9";
                  const iconColor = isWatch ? "#085041" : isPromo ? "#E05A2B" : isLogin ? "#2563EB" : "#64748b";
                  const Icon = isWatch ? Play : isPromo ? ArrowUp : isLogin ? LogIn : ArrowDown;

                  const lessonTitle = isWatch
                    ? (lessonTitleById[ev.detail] || ev.detail || "a lesson")
                    : null;

                  return (
                    <li key={i} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
                      <div
                        className="h-8 w-8 rounded-full grid place-items-center flex-shrink-0"
                        style={{ backgroundColor: iconBg }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800">
                          <Link
                            to={`/admin/trainees/${ev.trainee_id}`}
                            className="font-semibold hover:underline"
                          >
                            {ev.trainee_name}
                          </Link>
                          {isWatch && (
                            <span className="text-neutral-500 font-normal"> watched <span className="font-medium text-neutral-700">{lessonTitle}</span></span>
                          )}
                          {isPromo && (
                            <span className="text-neutral-500 font-normal"> promoted to <span className="font-semibold" style={{ color: "#E05A2B" }}>Level {ev.level}</span></span>
                          )}
                          {isDemote && (
                            <span className="text-neutral-500 font-normal"> demoted to <span className="font-semibold text-slate-500">Level {ev.level}</span></span>
                          )}
                          {isLogin && (
                            <span className="text-neutral-500 font-normal"> logged in</span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-neutral-400 flex-shrink-0 tabular-nums">
                        {relativeTime(ev.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {activityFeed.length > 20 && (
                <button
                  onClick={() => setFeedExpanded((v) => !v)}
                  className="mt-4 w-full text-xs font-medium text-neutral-400 hover:text-neutral-600 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {feedExpanded ? (
                    <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" /> Show {activityFeed.length - 20} more</>
                  )}
                </button>
              )}
            </>
          )}
          </div>
        )}
      </Card>

      {/* ---- Latest results ---- */}
      {latestResults.length > 0 && (
        <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8 no-print">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Latest results</p>
            <Link to="/admin/results" className="text-xs font-semibold" style={{ color: "#E05A2B" }}>
              Manage results &rarr;
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {latestResults.map((r) => (
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
                  <p className="text-xs text-neutral-500">{r.cycle || fmtDate(r.created_at)}</p>
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Quick module assignment per batch */}
      <BatchModulesPanel
        batches={batches}
        trainees={activeTrainees}
        open={batchModulesOpen}
        onToggle={() => setBatchModulesOpen((v) => !v)}
      />

      {/* Module-wise comparison of trainees */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8 no-print">
        <button
          onClick={() => setModuleComparisonOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-neutral-400" />
            <h2 className="text-xl font-semibold">Module-wise comparison</h2>
          </div>
          {moduleComparisonOpen ? (
            <ChevronUp className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          )}
        </button>
        {moduleComparisonOpen && (
          <>
            <p className="text-sm text-neutral-500 mt-1 mb-6">
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
          </>
        )}
      </Card>

      {/* Trainee-wise performance: same scores, pivoted to rank trainees */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8 no-print">
        <button
          onClick={() => setTraineePerfOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-neutral-400" />
            <h2 className="text-xl font-semibold">Trainee-wise performance</h2>
          </div>
          {traineePerfOpen ? (
            <ChevronUp className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          )}
        </button>
        {traineePerfOpen && (
          <>
        <p className="text-sm text-neutral-500 mt-1 mb-6">
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
          </>
        )}
      </Card>

      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Report</p>
          <h2 className="text-2xl font-semibold mt-1 tracking-tight">Since Level 1</h2>
          <p className="text-neutral-500 mt-2 max-w-2xl">
            What each trainee has done since the day they were promoted to Level 1 - clients/
            projects/sprints picked up and visits logged. Trainees still at Level 0 aren't
            shown{notYetCount > 0 ? ` (${notYetCount} of them)` : ""}.
            {attentionCount > 0 && (
              <span className="block mt-1 font-medium" style={{ color: "#dc2626" }}>
                {attentionCount} trainee{attentionCount === 1 ? "" : "s"} flagged - longer than
                expected at their current level.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={exportPdf}
          disabled={loading}
          className="text-sm inline-flex items-center gap-2 rounded-full px-4 py-2 text-white font-medium disabled:opacity-50 flex-shrink-0"
          style={{ backgroundColor: ORANGE }}
        >
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </button>
      </div>

      <Card className="rounded-2xl border-neutral-200/80 p-4 mb-6 no-print flex flex-wrap gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            Avg time at Level 0
          </p>
          <p className="text-2xl font-semibold mt-0.5 tabular-nums">
            {l0Stats.avgGraduated != null ? `${l0Stats.avgGraduated} days` : "—"}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            before promotion to L1 · {l0Stats.graduatedCount} trainee
            {l0Stats.graduatedCount === 1 ? "" : "s"}
          </p>
        </div>
        {l0Stats.stillAtL0Count > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
              Still at Level 0
            </p>
            <p className="text-2xl font-semibold mt-0.5 tabular-nums">
              {l0Stats.avgStillAtL0} days
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">
              avg so far · {l0Stats.stillAtL0Count} trainee
              {l0Stats.stillAtL0Count === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border-amber-200 bg-amber-50/60 p-4 mb-6 no-print">
        <div className="flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            Assignment scores come from a live sheet with no reliable submission date, so the
            "Assignments" figures are current totals, not filtered to since Level 1. Visit counts
            are a running total with no per-visit date, so they can't be split by date either.
          </p>
        </div>
      </Card>

      <div id={detailFor ? undefined : "printable-report"}>
        <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                  <th className="py-2.5 pl-5 pr-4 font-medium">Trainee</th>
                  <th className="py-2.5 pr-4 font-medium">Joined</th>
                  <th className="py-2.5 pr-4 font-medium">Promoted to L1</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Days since</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Assignments</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Clients</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Projects</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Sprints</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Avg bugs%</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Visits</th>
                  <th className="py-2.5 pr-5 font-medium text-right no-print">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-neutral-400">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-neutral-400">
                      No trainee has reached Level 1 yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.trainee.id}
                      className="hover:bg-neutral-50/60 cursor-pointer"
                      onClick={() => setDetailFor(r)}
                    >
                      <td className="py-2.5 pl-5 pr-4 font-medium text-neutral-800">
                        <span className="inline-flex items-center gap-1.5">
                          {r.needsAttention && (
                            <span
                              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: "#dc2626" }}
                              title={`${r.daysAtLevel} days at Level ${r.currentLevel} - expected within ${r.levelLimit}`}
                            />
                          )}
                          {r.trainee.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-500">{fmtDate(r.trainee.join_date)}</td>
                      <td className="py-2.5 pr-4 text-neutral-500">{fmtDate(r.l1Date)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.daysSinceL1}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.passedCount}/{r.assignments.length}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.clientRows.length}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.projectRows.length}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.sprintRows.length}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums" style={{ color: r.avgBugsPercent != null ? "#dc2626" : undefined }}>
                        {r.avgBugsPercent != null ? `${r.avgBugsPercent}%` : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-neutral-600">
                        {r.totalVisits}
                      </td>
                      <td className="py-2.5 pr-5 text-right no-print">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailFor(r);
                          }}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: ORANGE }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {detailFor && (
        <ReportDetailModal report={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </AppShell>
  );
}

function ReportDetailModal({ report, onClose }) {
  const {
    trainee,
    l1Date,
    daysSinceL1,
    clientRows,
    projectRows,
    sprintRows,
    avgBugsPercent,
    visitRows,
    assignments,
    passedCount,
    currentLevel,
    daysAtLevel,
    levelLimit,
    needsAttention,
  } = report;

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0 no-print">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
              Since Level 1 report
            </p>
            <p className="font-semibold text-lg">{trainee.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="text-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white font-medium"
              style={{ backgroundColor: ORANGE }}
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full hover:bg-neutral-100 grid place-items-center"
            >
              <X className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
        </div>

        <div id="printable-report" className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">{trainee.name}</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Joined {fmtDate(trainee.join_date)} · Promoted to Level 1 on {fmtDate(l1Date)} ·{" "}
              {daysSinceL1} days since
            </p>
            {needsAttention && (
              <p className="text-sm font-medium mt-2" style={{ color: "#dc2626" }}>
                Flagged: {daysAtLevel} days at Level {currentLevel}, longer than the expected{" "}
                {levelLimit}.
              </p>
            )}
          </div>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
              Assignment scores (current) · {passedCount}/{assignments.length} passed
            </h3>
            {assignments.length === 0 ? (
              <p className="text-sm text-neutral-400">No assignments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                {assignments.map((a) => (
                  <li key={a.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-700">{a.name}</span>
                    <span
                      className="text-sm font-medium tabular-nums"
                      style={{ color: a.passed ? "#16a34a" : "#dc2626" }}
                    >
                      {a.score}/{a.total} {a.passed ? "Pass" : "Fail"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 inline-flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" />
              Clients handled since L1 · {clientRows.length}
            </h3>
            {clientRows.length === 0 ? (
              <p className="text-sm text-neutral-400">None yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                {clientRows.map((c) => (
                  <li key={c.client_name} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-700 truncate">
                      {c.client_name}
                      {c.handling_mode === "assisted" && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: ORANGE }}>
                          assisted
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-neutral-400 flex-shrink-0 tabular-nums">
                      {fmtDate(c.assigned_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 inline-flex items-center gap-1.5">
              <Layers className="h-3 w-3" />
              Projects handled since L1 · {projectRows.length}
            </h3>
            {projectRows.length === 0 ? (
              <p className="text-sm text-neutral-400">None yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                {projectRows.map((p) => (
                  <li key={p.project_name} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-700 truncate">
                      {p.project_name}
                      {p.handling_mode === "assisted" && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: ORANGE }}>
                          assisted
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-neutral-400 flex-shrink-0 tabular-nums">
                      {fmtDate(p.assigned_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 inline-flex items-center gap-1.5">
              <Rocket className="h-3 w-3" />
              Sprints handled since L1 · {sprintRows.length}
              {avgBugsPercent != null && (
                <span className="normal-case font-medium" style={{ color: "#dc2626" }}>
                  · avg {avgBugsPercent}% bugs
                </span>
              )}
            </h3>
            {sprintRows.length === 0 ? (
              <p className="text-sm text-neutral-400">None yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                {sprintRows.map((s) => (
                  <li key={s.sprint_name} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-700 truncate">
                      {s.sprint_name}
                      <span
                        className="ml-2 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: s.sprint_type === "major" ? "#2563eb" : "#a3a3a3" }}
                      >
                        {s.sprint_type}
                      </span>
                      {s.handling_mode === "assisted" && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: ORANGE }}>
                          assisted
                        </span>
                      )}
                      {s.bugs_percent > 0 && (
                        <span className="ml-2 text-[10px] font-semibold tabular-nums" style={{ color: "#dc2626" }}>
                          {s.bugs_percent}% bugs
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-neutral-400 flex-shrink-0 tabular-nums">
                      {fmtDate(s.assigned_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Remarks
            </h3>
            <p className="text-sm whitespace-pre-wrap break-words p-3 rounded-xl bg-neutral-50">
              {trainee.notes ? (
                <span className="text-neutral-700">{trainee.notes}</span>
              ) : (
                <span className="text-neutral-400">No remarks yet</span>
              )}
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 inline-flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Client visits (all-time total)
            </h3>
            {visitRows.length === 0 ? (
              <p className="text-sm text-neutral-400">No visits logged.</p>
            ) : (
              <ul className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                {visitRows.map((v) => (
                  <li key={v.client_name} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-neutral-700 truncate">{v.client_name}</span>
                    <span className="text-sm font-medium tabular-nums text-neutral-600">
                      {v.visit_count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
