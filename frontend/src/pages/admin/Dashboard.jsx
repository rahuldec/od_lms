import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import { fetchSheetModules } from "@/lib/sheet";
import { fetchClients, groupAssignmentsByTrainee } from "@/lib/clients";
import { groupProjectAssignmentsByTrainee } from "@/lib/projects";
import { groupSprintAssignmentsByTrainee } from "@/lib/sprints";
import { daysAtCurrentLevel } from "@/lib/levelHistory";
import "@/styles/glass3d.css";
import AppShell from "@/components/AppShell";
import LevelTimeline from "@/components/LevelTimeline";
import ClientAssignDialog from "@/components/ClientAssignDialog";
import ProjectAssignDialog from "@/components/ProjectAssignDialog";
import SprintAssignDialog from "@/components/SprintAssignDialog";
import VisitLogDialog from "@/components/VisitLogDialog";
import RemarksDialog from "@/components/RemarksDialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, X, BarChart3, Layers, Flag, FileText, Play, ArrowUp, ArrowDown, Activity, LogIn, Briefcase, MapPin, Rocket, MessageSquare, Info, AlertTriangle, Plus } from "lucide-react";
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

const Stat = ({ icon: Icon, label, value, testId, accent }) => (
  <Card data-testid={testId} className="rounded-2xl border-neutral-200/80 p-6 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">{label}</p>
        <p className="text-4xl font-semibold mt-3 tabular-nums" style={{ color: accent?.color || "#171717" }}>
          {value}
        </p>
      </div>
      <div
        className="h-9 w-9 rounded-xl grid place-items-center"
        style={{ backgroundColor: accent?.bg || "#FFF0E8", color: accent?.color || "#E05A2B" }}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </Card>
);

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/clients", label: "Clients", testId: "nav-clients" },
  { to: "/admin/assignment-schedule", label: "Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/reports", label: "Reports", testId: "nav-reports" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources", group: "Content" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules", group: "Content" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars", group: "Content" },
  { to: "/admin/results", label: "Results", testId: "nav-results", group: "Content" },
];

const ORANGE = "#E05A2B";

const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];

// Days a trainee is expected to spend at each level before it's worth
// flagging them as stuck - not a hard rule, just a prompt to go look.
const LEVEL_DAY_LIMITS = { 0: 30, 1: 60, 2: 60, 3: 60 };
const needsAttention = (t) => daysAtCurrentLevel(t) > (LEVEL_DAY_LIMITS[t.current_level ?? 0] ?? 60);

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

const assistedCount = (list) => list.filter((x) => x.handling_mode === "assisted").length;

// Overall bugs% for a trainee: the plain average of bugs_percent across
// every sprint they've been assigned, rounded to the nearest whole percent.
const avgBugsPercent = (sprints) =>
  sprints.length
    ? Math.round(sprints.reduce((sum, s) => sum + (s.bugs_percent || 0), 0) / sprints.length)
    : 0;

// One trainee's card inside a Level distribution group. Split out from the
// inline map so the assignment score list can hold its own collapsed/expanded
// state - the score bars are the tallest, least-glanceable part of the card,
// so they start collapsed to a one-line summary instead of always rendering
// five full progress bars per trainee.
function TraineeCard({
  t,
  assignments,
  assignmentsLoading,
  batchNameById,
  myClients,
  myProjects,
  mySprints,
  visitRows,
  onAssignClients,
  onAssignProjects,
  onAssignSprints,
  onLogVisits,
  onEditRemarks,
  onOpenAssignment,
}) {
  const [scoresOpen, setScoresOpen] = useState(false);
  const [sprintsOpen, setSprintsOpen] = useState(false);

  const history = Array.isArray(t.history) ? t.history : [];
  const promotions = history.filter((h) => h.type === "promotion");
  const latestPromotion = promotions[promotions.length - 1];
  const days = daysSince(t.join_date);
  const levelDays = daysAtCurrentLevel(t);
  const flagged = needsAttention(t);
  // Sprints are a QA-team concept - CS trainees never see the section.
  const showSprints = t.department !== "CS";

  let scoreSum = 0;
  let totalSum = 0;
  let passedCount = 0;
  assignments.forEach((a) => {
    if (a.score != null && a.total != null) {
      scoreSum += a.score;
      totalSum += a.total;
    }
    if (a.passed) passedCount += 1;
  });
  const avgPct = totalSum > 0 ? Math.round((scoreSum / totalSum) * 100) : null;

  return (
    <div className="g3d-scope g3d-card relative p-4 overflow-hidden">
      {days !== null && (
        <div
          className="g3d-ghost-num absolute -top-2 -right-1 select-none pointer-events-none leading-none font-black tracking-tighter"
          style={{ fontSize: "3.75rem" }}
        >
          {days}
        </div>
      )}
      <div className="relative flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="g3d-avatar h-9 w-9 grid place-items-center text-white text-sm font-bold flex-shrink-0">
            {t.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link
              to={`/admin/trainees/${t.id}`}
              className="text-base font-semibold hover:underline truncate block"
            >
              {t.name}
            </Link>
            <p className="text-sm truncate" style={{ color: "var(--g3d-faint)" }}>@{t.username}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span
          className="g3d-chip"
          style={
            t.status === "Active"
              ? { "--fill": "var(--g3d-good-bg)", "--ink2": "var(--g3d-good-ink)" }
              : undefined
          }
        >
          {t.status}
        </span>
        <span
          className="g3d-chip solid"
          style={flagged ? { "--fill": "var(--g3d-bad-bg)", color: "var(--g3d-bad-ink)" } : undefined}
          title={
            flagged
              ? `${levelDays} days at Level ${t.current_level ?? 0} - longer than the expected ${LEVEL_DAY_LIMITS[t.current_level ?? 0] ?? 60}`
              : `${levelDays} day${levelDays === 1 ? "" : "s"} at Level ${t.current_level ?? 0}`
          }
        >
          {flagged && <AlertTriangle className="h-2.5 w-2.5" />}
          L{t.current_level ?? 0}
          <span className="opacity-80 tabular-nums">· {levelDays}d</span>
        </span>
        {t.batch_id && batchNameById[t.batch_id] && (
          <span className="g3d-chip" style={{ "--fill": "var(--g3d-batch-bg)", "--ink2": "var(--g3d-batch-ink)" }}>
            {batchNameById[t.batch_id]}
          </span>
        )}
        {t.department && (
          <span
            className="g3d-chip"
            style={
              t.department === "QA"
                ? { "--fill": "var(--g3d-qa-bg)", "--ink2": "var(--g3d-qa-ink)" }
                : { "--fill": "var(--g3d-cs-bg)", "--ink2": "var(--g3d-cs-ink)" }
            }
          >
            {t.department}
          </span>
        )}
        {latestPromotion && (
          <span className="inline-flex items-center gap-0.5 text-xs ml-auto" style={{ color: "var(--g3d-faint)" }}>
            <TrendingUp className="h-3 w-3" />
            {fmtDate(latestPromotion.effective_date || latestPromotion.at)}
          </span>
        )}
      </div>

      <LevelTimeline trainee={t} variant="glass3d" />

      {/* Learning Phase - assignment scores. Collapsed to a one-line summary
          by default - five full progress bars per card, times every trainee
          in an expanded level, is the single biggest source of clutter on
          this page. Moved above Clients/Projects/etc so scoring is the
          first thing seen after the level bar, not the last. */}
      <div className="g3d-well relative mb-3 p-2.5">
        <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
          <BarChart3 className="h-3 w-3 flex-shrink-0" />
          Learning Phase
        </span>
        {assignmentsLoading ? (
          <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>Loading assignment scores…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>No assignments yet</p>
        ) : (
          <div className="mt-1.5">
            <button
              onClick={() => setScoresOpen((v) => !v)}
              className="w-full flex items-center justify-between text-sm hover:opacity-80"
              style={{ color: "var(--g3d-soft)" }}
            >
              <span>
                {passedCount}/{assignments.length} passed
                {avgPct != null && (
                  <span style={{ color: "var(--g3d-faint)" }}> · avg {avgPct}%</span>
                )}
              </span>
              {scoresOpen ? (
                <ChevronUp className="h-3 w-3" style={{ color: "var(--g3d-faint)" }} />
              ) : (
                <ChevronDown className="h-3 w-3" style={{ color: "var(--g3d-faint)" }} />
              )}
            </button>
            {scoresOpen && (
              <div className="flex flex-col gap-1.5 mt-2">
                {assignments.map((a) => {
                  const color = a.passed ? "var(--g3d-good-ink)" : "var(--g3d-bad-ink)";
                  const fill = a.passed ? "var(--g3d-good-bg)" : "var(--g3d-bad-bg)";
                  const pct = a.total ? Math.min(100, Math.round((a.score / a.total) * 100)) : 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onOpenAssignment(a)}
                      className="text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm" style={{ color: "var(--g3d-soft)" }}>{a.name}</span>
                        <span className="text-sm font-medium" style={{ color }}>
                          {a.score}/{a.total} {a.passed ? "Pass" : "Fail"}
                        </span>
                      </div>
                      <div className="g3d-track h-1.5">
                        <div
                          className="g3d-track-fill h-full"
                          style={{ width: `${pct}%`, backgroundColor: fill }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clients / Projects / Sprints / Visits sit side by side rather than
          stacked - short lists read better across than piled one under
          another, especially now the text inside them is bigger. Cards are
          full-width now specifically to give this row room to breathe. */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 ${showSprints ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
            <Briefcase className="h-3 w-3 flex-shrink-0" />
            Clients
          </span>
          <button
            onClick={onAssignClients}
            data-testid={`assign-clients-${t.id}`}
            className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            style={{ color: "var(--g3d-accent)" }}
          >
            {myClients.length > 0 ? "Manage" : (<><Plus className="h-3 w-3" />Assign</>)}
          </button>
        </div>
        {myClients.length > 0 && (
          <p className="text-[11px] mb-1.5 tabular-nums" style={{ color: "var(--g3d-faint)" }}>
            {myClients.length} assigned
            {assistedCount(myClients) > 0 && (
              <span style={{ color: "var(--g3d-accent)" }}> · {assistedCount(myClients)} assisted</span>
            )}
          </p>
        )}
        {myClients.length === 0 ? (
          <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>No clients assigned</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {myClients.map((c) => (
              <span
                key={c.client_name}
                title={`${c.client_name} · ${c.handling_mode === "assisted" ? "Assisted" : "Solo"}`}
                className="g3d-pill text-sm"
                style={
                  c.handling_mode === "assisted"
                    ? { "--fill": "var(--g3d-accent-soft)", "--ink2": "var(--g3d-accent-ink)" }
                    : undefined
                }
              >
                <span className="min-w-0 break-words">{c.client_name}</span>
                {c.handling_mode === "assisted" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0">
                    assisted
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
            <Layers className="h-3 w-3 flex-shrink-0" />
            Projects
          </span>
          <button
            onClick={onAssignProjects}
            data-testid={`assign-projects-${t.id}`}
            className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            style={{ color: "var(--g3d-accent)" }}
          >
            {myProjects.length > 0 ? "Manage" : (<><Plus className="h-3 w-3" />Assign</>)}
          </button>
        </div>
        {myProjects.length > 0 && (
          <p className="text-[11px] mb-1.5 tabular-nums" style={{ color: "var(--g3d-faint)" }}>
            {myProjects.length} assigned
            {assistedCount(myProjects) > 0 && (
              <span style={{ color: "var(--g3d-accent)" }}> · {assistedCount(myProjects)} assisted</span>
            )}
          </p>
        )}
        {myProjects.length === 0 ? (
          <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>No projects assigned</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {myProjects.map((p) => (
              <span
                key={p.project_name}
                title={`${p.project_name} · ${p.handling_mode === "assisted" ? "Assisted" : "Solo"}`}
                className="g3d-pill text-sm"
                style={
                  p.handling_mode === "assisted"
                    ? { "--fill": "var(--g3d-accent-soft)", "--ink2": "var(--g3d-accent-ink)" }
                    : undefined
                }
              >
                <span className="min-w-0 break-words">{p.project_name}</span>
                {p.handling_mode === "assisted" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0">
                    assisted
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {showSprints && (
      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
            <Rocket className="h-3 w-3 flex-shrink-0" />
            Sprints
          </span>
          <button
            onClick={onAssignSprints}
            data-testid={`assign-sprints-${t.id}`}
            className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            style={{ color: "var(--g3d-accent)" }}
          >
            {mySprints.length > 0 ? "Manage" : (<><Plus className="h-3 w-3" />Assign</>)}
          </button>
        </div>
        {mySprints.length > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <p className="text-[11px] tabular-nums" style={{ color: "var(--g3d-faint)" }}>
              {mySprints.length} assigned
              {assistedCount(mySprints) > 0 && (
                <span style={{ color: "var(--g3d-accent)" }}> · {assistedCount(mySprints)} assisted</span>
              )}
              <span style={{ color: "var(--g3d-bad-ink)" }}> · avg {avgBugsPercent(mySprints)}% bugs</span>
            </p>
            <button
              onClick={() => setSprintsOpen((v) => !v)}
              title={sprintsOpen ? "Hide sprint details" : "Show sprint details"}
              className="flex-shrink-0"
              style={{ color: "var(--g3d-faint)" }}
            >
              <Info className="h-3 w-3" />
            </button>
          </div>
        )}
        {mySprints.length === 0 ? (
          <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>No sprints assigned</p>
        ) : !sprintsOpen ? null : (
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {mySprints.map((s) => (
              <span
                key={s.sprint_name}
                title={`${s.sprint_name} · ${s.sprint_type === "major" ? "Major" : "Minor"} · ${s.handling_mode === "assisted" ? "Assisted" : "Solo"} · ${s.bugs_percent || 0}% bugs found`}
                className="g3d-pill text-sm"
                style={
                  s.handling_mode === "assisted"
                    ? { "--fill": "var(--g3d-accent-soft)", "--ink2": "var(--g3d-accent-ink)" }
                    : undefined
                }
              >
                <span className="min-w-0 break-words">{s.sprint_name}</span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
                  style={{ color: s.sprint_type === "major" ? "var(--g3d-batch-ink)" : "var(--g3d-faint)" }}
                >
                  {s.sprint_type}
                </span>
                {s.handling_mode === "assisted" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0">
                    assisted
                  </span>
                )}
                {s.bugs_percent > 0 && (
                  <span className="text-[10px] font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--g3d-bad-ink)" }}>
                    {s.bugs_percent}% bugs
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Visits. A visit can be logged for any client from the sheet, not
          only ones formally assigned to this trainee, so this reads from
          visitRows directly rather than cross-referencing myClients. */}
      {(() => {
        const visited = visitRows
          .filter((v) => v.visit_count > 0)
          .map((v) => ({ client_name: v.client_name, count: v.visit_count }));
        return (
          <div className="g3d-well relative min-w-0 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
              <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
                <MapPin className="h-3 w-3 flex-shrink-0" />
                Visits
              </span>
              <button
                onClick={onLogVisits}
                data-testid={`log-visits-${t.id}`}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
                style={{ color: "var(--g3d-accent)" }}
              >
                {visited.length > 0 ? "Manage" : (<><Plus className="h-3 w-3" />Log</>)}
              </button>
            </div>
            {visited.length > 0 && (
              <p className="text-[11px] mb-1.5 tabular-nums" style={{ color: "var(--g3d-faint)" }}>
                {visited.reduce((sum, c) => sum + c.count, 0)} total
              </p>
            )}
            {visited.length === 0 ? (
              <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>No visits logged</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {visited.map((c) => (
                  <span key={c.client_name} className="g3d-pill text-sm">
                    <span className="min-w-0 break-words">{c.client_name}</span>
                    <span className="tabular-nums flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>· {c.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      </div>

      {/* Remarks. Backed by trainees.notes - general free-text notes, not
          tied to any specific client/project/sprint. */}
      <div className="g3d-well relative mb-3 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
            <MessageSquare className="h-3 w-3 flex-shrink-0" />
            Remarks
          </span>
          <button
            onClick={onEditRemarks}
            data-testid={`edit-remarks-${t.id}`}
            className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            style={{ color: "var(--g3d-accent)" }}
          >
            {t.notes ? "Edit" : (<><Plus className="h-3 w-3" />Add</>)}
          </button>
        </div>
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words" style={{ color: t.notes ? "var(--g3d-ink)" : "var(--g3d-faint)" }}>
          {t.notes || "No remarks yet"}
        </p>
      </div>
    </div>
  );
}

// Read-only summary widget for the dashboard: for every batch, show which
// modules are currently assigned (visible to trainees) and which one the
// batch is actively on. Editing assignments / current module happens on the
// Batch Detail page — this is just a quick at-a-glance overview across all
// batches.
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
    <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
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

export default function AdminDashboard() {
  const [trainees, setTrainees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [assignmentResults, setAssignmentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [results, setResults] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [sheetModules, setSheetModules] = useState([]);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientAssignments, setClientAssignments] = useState([]);
  const [assignFor, setAssignFor] = useState(null);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [projectAssignFor, setProjectAssignFor] = useState(null);
  const [sprintAssignments, setSprintAssignments] = useState([]);
  const [sprintAssignFor, setSprintAssignFor] = useState(null);
  const [clientVisits, setClientVisits] = useState([]);
  const [visitDialogFor, setVisitDialogFor] = useState(null);
  const [remarksFor, setRemarksFor] = useState(null);

  // Collapsible sections below load nothing until first expanded - the
  // heaviest calls here (assignment scores, activity feed, batch modules)
  // each involve a live Google Sheet round trip, so a dashboard visit that
  // never opens them should not pay for them.
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const activityRequested = useRef(false);

  const [batchModulesOpen, setBatchModulesOpen] = useState(false);

  const [moduleComparisonOpen, setModuleComparisonOpen] = useState(false);
  const [traineePerfOpen, setTraineePerfOpen] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const assignmentsRequested = useRef(false);

  const ensureAssignmentResults = useCallback(async () => {
    if (assignmentsRequested.current) return;
    assignmentsRequested.current = true;
    setAssignmentsLoading(true);
    try {
      const data = await fetchAllAssignmentResults();
      setAssignmentResults(data || {});
    } catch {
      // leave empty - sections just show "no data recorded"
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

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
          data,
          batchData,
          resultsData,
          clientData,
          clientAssignData,
          projectAssignData,
          sprintAssignData,
          visitData,
        ] = await Promise.all([
          api.listTrainees(),
          api.listBatches().catch(() => []),
          api.listResultsAdmin().catch(() => []),
          // Non-fatal: a sheet outage or a missing table should degrade the
          // clients strip to empty, not take the whole dashboard down.
          fetchClients().catch(() => []),
          api.listClientAssignments().catch(() => []),
          api.listProjectAssignments().catch(() => []),
          api.listSprintAssignments().catch(() => []),
          api.listClientVisits().catch(() => []),
        ]);
        setTrainees(Array.isArray(data) ? data : []);
        setBatches(Array.isArray(batchData) ? batchData : []);
        setResults(Array.isArray(resultsData) ? resultsData.filter((r) => r.published).slice(0, 3) : []);
        setClients(Array.isArray(clientData) ? clientData : []);
        setClientAssignments(Array.isArray(clientAssignData) ? clientAssignData : []);
        setProjectAssignments(Array.isArray(projectAssignData) ? projectAssignData : []);
        setSprintAssignments(Array.isArray(sprintAssignData) ? sprintAssignData : []);
        setClientVisits(Array.isArray(visitData) ? visitData : []);
      } catch (e) {
        toast.error("Could not load trainees");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build lesson_id → title map from sheet modules
  const lessonTitleById = useMemo(() => {
    const map = {};
    sheetModules.forEach((mod) => {
      (mod.lessons || []).forEach((l) => {
        map[l.id] = l.title;
      });
    });
    return map;
  }, [sheetModules]);

  const batchNameById = useMemo(() => {
    const map = {};
    batches.forEach((b) => (map[b.id] = b.name));
    return map;
  }, [batches]);

  // clientsByTrainee is keyed by trainee id; ownersByClient is the inverse,
  // keyed by lowercased client name -> trainee names, so the assign dialog can
  // warn when a client is already on someone else's book.
  const clientsByTrainee = useMemo(
    () => groupAssignmentsByTrainee(clientAssignments),
    [clientAssignments]
  );

  const traineeNameById = useMemo(
    () => Object.fromEntries(trainees.map((t) => [t.id, t.name])),
    [trainees]
  );

  const ownersByClient = useMemo(() => {
    const map = {};
    clientAssignments.forEach((a) => {
      if (!a?.client_name) return;
      const key = a.client_name.trim().toLowerCase();
      if (!map[key]) map[key] = [];
      const name = traineeNameById[a.trainee_id];
      if (name) map[key].push(name);
    });
    return map;
  }, [clientAssignments, traineeNameById]);

  const projectsByTrainee = useMemo(
    () => groupProjectAssignmentsByTrainee(projectAssignments),
    [projectAssignments]
  );

  const sprintsByTrainee = useMemo(
    () => groupSprintAssignmentsByTrainee(sprintAssignments),
    [sprintAssignments]
  );

  // visitsByTrainee is keyed by trainee id -> [{client_name, visit_count}].
  // Not filtered through myClients, since a visit can be logged for any
  // client from the sheet, not only ones formally assigned to the trainee.
  const visitsByTrainee = useMemo(() => {
    const map = {};
    clientVisits.forEach((v) => {
      if (!v?.trainee_id || !v?.client_name) return;
      if (!map[v.trainee_id]) map[v.trainee_id] = [];
      map[v.trainee_id].push({ client_name: v.client_name, visit_count: v.visit_count || 0 });
    });
    return map;
  }, [clientVisits]);

  const filteredTrainees = useMemo(() => {
    let list = trainees.filter((t) => t.status !== "Exited");
    if (selectedBatch === "none") list = list.filter((t) => !t.batch_id);
    else if (selectedBatch !== "all") list = list.filter((t) => t.batch_id === selectedBatch);
    if (selectedDept !== "all") list = list.filter((t) => t.department === selectedDept);
    return list;
  }, [trainees, selectedBatch, selectedDept]);

  const total = filteredTrainees.length;
  const active = filteredTrainees.filter((t) => t.status === "Active").length;
  const onHold = filteredTrainees.filter((t) => t.status === "On Hold").length;
  const attentionCount = filteredTrainees.filter(needsAttention).length;

  const levelGroups = [0, 1, 2, 3].map((lvl) => ({
    level: lvl,
    trainees: filteredTrainees
      .filter((t) => (t.current_level ?? 0) === lvl)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <Stat testId="stat-total" icon={Users} label="Total trainees" value={loading ? "-" : total} />
        <Stat testId="stat-active" icon={CheckCircle2} label="Active" value={loading ? "-" : active} />
        <Stat testId="stat-onhold" icon={PauseCircle} label="On hold" value={loading ? "-" : onHold} />
        <Stat testId="stat-promotions" icon={TrendingUp} label="Promotions this month" value={loading ? "-" : promotionsThisMonth} />
        <Stat
          testId="stat-attention"
          icon={AlertTriangle}
          label="Needs attention"
          value={loading ? "-" : attentionCount}
          accent={attentionCount > 0 ? { bg: "#FEE2E2", color: "#dc2626" } : undefined}
        />
      </div>

      {/* ---- Activity Feed ---- */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
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

      <div className="flex items-center justify-end gap-2 mb-4">
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="text-sm border border-neutral-200 rounded-full px-4 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
        >
          <option value="all">All departments</option>
          <option value="CS">CS</option>
          <option value="QA">QA</option>
        </select>
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
      <BatchModulesPanel
        batches={batches}
        trainees={trainees.filter((t) => t.status !== "Exited")}
        open={batchModulesOpen}
        onToggle={() => setBatchModulesOpen((v) => !v)}
      />

      {/* Module-wise comparison of trainees */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
        <button
          onClick={() => {
            setModuleComparisonOpen((v) => !v);
            ensureAssignmentResults();
          }}
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
            {assignmentsLoading ? (
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
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
        <button
          onClick={() => {
            setTraineePerfOpen((v) => !v);
            ensureAssignmentResults();
          }}
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
        {assignmentsLoading ? (
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

      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Level distribution</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Click a level to see trainees, their clients, assignment scores and promotion history.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <span>{total} trainees</span>
            <span className="text-neutral-200">|</span>
            <Link to="/admin/clients" className="font-semibold" style={{ color: "#E05A2B" }}>
              Manage clients &rarr;
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {levelGroups.map(({ level, trainees: lvlTrainees }) => {
            const pct = total ? Math.round((lvlTrainees.length / total) * 100) : 0;
            const isExpanded = expandedLevel === level;
            const lvlClientCount = lvlTrainees.reduce(
              (acc, t) => acc + (clientsByTrainee[t.id]?.length || 0),
              0
            );
            const lvlAttentionCount = lvlTrainees.filter(needsAttention).length;
            return (
              <div key={level} className="border border-neutral-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => {
                    setExpandedLevel(isExpanded ? null : level);
                    if (!isExpanded) ensureAssignmentResults();
                  }}
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
                        {lvlClientCount > 0 && (
                          <span className="text-neutral-400"> - {lvlClientCount} clients</span>
                        )}
                        {lvlAttentionCount > 0 && (
                          <span className="font-medium" style={{ color: "#dc2626" }}>
                            {" "}
                            - {lvlAttentionCount} need attention
                          </span>
                        )}
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
                    <div className="grid grid-cols-1 gap-3">
                      {lvlTrainees.map((t) => (
                        <TraineeCard
                          key={t.id}
                          t={t}
                          assignments={getAssignments(t.name)}
                          assignmentsLoading={assignmentsLoading}
                          batchNameById={batchNameById}
                          myClients={clientsByTrainee[t.id] || []}
                          myProjects={projectsByTrainee[t.id] || []}
                          mySprints={sprintsByTrainee[t.id] || []}
                          visitRows={visitsByTrainee[t.id] || []}
                          onAssignClients={() => setAssignFor(t)}
                          onAssignProjects={() => setProjectAssignFor(t)}
                          onAssignSprints={() => setSprintAssignFor(t)}
                          onLogVisits={() => setVisitDialogFor(t)}
                          onEditRemarks={() => setRemarksFor(t)}
                          onOpenAssignment={setActiveAssignment}
                        />
                      ))}
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

      {assignFor && (
        <ClientAssignDialog
          trainee={assignFor}
          clients={clients}
          assigned={clientsByTrainee[assignFor.id] || []}
          ownersByClient={ownersByClient}
          onClose={() => setAssignFor(null)}
          onSaved={(assignments) =>
            // Patch in place rather than re-fetching the whole assignment list -
            // the dashboard already holds every other row unchanged.
            setClientAssignments((prev) => [
              ...prev.filter((a) => a.trainee_id !== assignFor.id),
              ...assignments.map((a) => ({
                id: `${assignFor.id}-${a.client_name}`,
                trainee_id: assignFor.id,
                client_name: a.client_name,
                handling_mode: a.handling_mode,
              })),
            ])
          }
        />
      )}

      {projectAssignFor && (
        <ProjectAssignDialog
          trainee={projectAssignFor}
          assigned={projectsByTrainee[projectAssignFor.id] || []}
          onClose={() => setProjectAssignFor(null)}
          onSaved={(assignments) =>
            setProjectAssignments((prev) => [
              ...prev.filter((a) => a.trainee_id !== projectAssignFor.id),
              ...assignments.map((a) => ({
                id: `${projectAssignFor.id}-${a.project_name}`,
                trainee_id: projectAssignFor.id,
                project_name: a.project_name,
                handling_mode: a.handling_mode,
              })),
            ])
          }
        />
      )}

      {sprintAssignFor && (
        <SprintAssignDialog
          trainee={sprintAssignFor}
          assigned={sprintsByTrainee[sprintAssignFor.id] || []}
          onClose={() => setSprintAssignFor(null)}
          onSaved={(assignments) =>
            setSprintAssignments((prev) => [
              ...prev.filter((a) => a.trainee_id !== sprintAssignFor.id),
              ...assignments.map((a) => ({
                id: `${sprintAssignFor.id}-${a.sprint_name}`,
                trainee_id: sprintAssignFor.id,
                sprint_name: a.sprint_name,
                sprint_type: a.sprint_type,
                handling_mode: a.handling_mode,
                bugs_percent: a.bugs_percent,
              })),
            ])
          }
        />
      )}

      {visitDialogFor && (
        <VisitLogDialog
          trainee={visitDialogFor}
          allClients={clients}
          visits={visitsByTrainee[visitDialogFor.id] || []}
          onClose={() => setVisitDialogFor(null)}
          onSaved={(saved) =>
            setClientVisits((prev) => {
              const key = (n) => n.trim().toLowerCase();
              const savedKeys = new Set(saved.map((s) => key(s.client_name)));
              return [
                ...prev.filter(
                  (v) => !(v.trainee_id === visitDialogFor.id && savedKeys.has(key(v.client_name)))
                ),
                ...saved.map((s) => ({
                  trainee_id: visitDialogFor.id,
                  client_name: s.client_name,
                  visit_count: s.visit_count,
                })),
              ];
            })
          }
        />
      )}

      {remarksFor && (
        <RemarksDialog
          trainee={remarksFor}
          onClose={() => setRemarksFor(null)}
          onSaved={(notes) =>
            setTrainees((prev) => prev.map((t) => (t.id === remarksFor.id ? { ...t, notes } : t)))
          }
        />
      )}
    </AppShell>
  );
}
