import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
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
import CsatDialog from "@/components/CsatDialog";
import CardSettingsDialog from "@/components/CardSettingsDialog";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, X, BarChart3, Layers, Briefcase, MapPin, Rocket, MessageSquare, Info, AlertTriangle, Plus, Settings, Smile } from "lucide-react";
import { toast } from "sonner";

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

const ORANGE = "#E05A2B";

const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];

// Days a trainee is expected to spend at each level before it's worth
// flagging them as stuck - not a hard rule, just a prompt to go look.
const LEVEL_DAY_LIMITS = { 0: 30, 1: 60, 2: 60, 3: 60 };
const needsAttention = (t) => daysAtCurrentLevel(t) > (LEVEL_DAY_LIMITS[t.current_level ?? 0] ?? 60);

// Which optional dashboard-card sections apply to a trainee. Null/missing
// enabled_cards means "everything on" - existing trainees keep every
// section until an admin explicitly narrows it down via the card's
// settings icon.
const isCardEnabled = (t, key) => !Array.isArray(t.enabled_cards) || t.enabled_cards.includes(key);
// Static so Tailwind's content scanner can find each full class name -
// a computed string like `lg:grid-cols-${n}` wouldn't be picked up.
const GRID_COLS_LG = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

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
  onEditCsat,
  onEditCardSettings,
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
  // Sprints are a QA-team concept - CS trainees never see the section,
  // regardless of the admin's card settings for this trainee.
  const showSprints = t.department !== "CS";

  // Which of the optional sections below actually render for this trainee -
  // drives both which wells show up and how many grid columns to use, so a
  // trainee with only Clients enabled doesn't leave three empty slots.
  const cardsEnabled = {
    clients: isCardEnabled(t, "clients"),
    projects: isCardEnabled(t, "projects"),
    sprints: showSprints && isCardEnabled(t, "sprints"),
    visits: isCardEnabled(t, "visits"),
    csat: isCardEnabled(t, "csat"),
  };
  const visibleCardCount = Object.values(cardsEnabled).filter(Boolean).length;

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
        <div className="flex items-center gap-2 flex-shrink-0">
          {days !== null && (
            <span
              className="text-base font-extrabold tabular-nums"
              style={{ color: "var(--g3d-ink)" }}
              title={`${days} day${days === 1 ? "" : "s"} in training`}
            >
              {days}d
            </span>
          )}
          <button
            onClick={onEditCardSettings}
            data-testid={`card-settings-${t.id}`}
            title="Choose which sections show on this card"
            className="h-7 w-7 rounded-full grid place-items-center hover:opacity-70"
            style={{ color: "var(--g3d-faint)" }}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
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
        <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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

      {/* Clients / Projects / Sprints / Visits / CSAT sit side by side rather
          than stacked - short lists read better across than piled one under
          another, especially now the text inside them is bigger. Which of
          these appear at all is per-trainee (the card's settings icon),
          so the grid only reserves as many columns as are actually shown -
          a trainee with just Clients enabled doesn't leave empty slots. */}
      {visibleCardCount > 0 && (
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 ${GRID_COLS_LG[Math.min(visibleCardCount, 5)]}`}>
      {cardsEnabled.clients && (
      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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
      )}

      {cardsEnabled.projects && (
      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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
      )}

      {cardsEnabled.sprints && (
      <div className="g3d-well relative min-w-0 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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
      {cardsEnabled.visits && (() => {
        const visited = visitRows
          .filter((v) => v.visit_count > 0)
          .map((v) => ({ client_name: v.client_name, count: v.visit_count }));
        return (
          <div className="g3d-well relative min-w-0 p-2.5">
            <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
              <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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

      {/* CSAT. Admin-entered, backed by trainees.csat_score - no external
          source wired up. */}
      {cardsEnabled.csat && (
        <div className="g3d-well relative min-w-0 p-2.5">
          <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
            <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
              <Smile className="h-3 w-3 flex-shrink-0" />
              CSAT
            </span>
            <button
              onClick={onEditCsat}
              data-testid={`edit-csat-${t.id}`}
              className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
              style={{ color: "var(--g3d-accent)" }}
            >
              {t.csat_score != null ? "Edit" : (<><Plus className="h-3 w-3" />Add</>)}
            </button>
          </div>
          {t.csat_score != null ? (
            <p className="text-lg font-semibold mt-1.5 tabular-nums" style={{ color: "var(--g3d-ink)" }}>
              {t.csat_score}%
            </p>
          ) : (
            <p className="text-sm mt-1.5" style={{ color: "var(--g3d-faint)" }}>Not recorded</p>
          )}
        </div>
      )}
      </div>
      )}

      {/* Remarks. Backed by trainees.notes - general free-text notes, not
          tied to any specific client/project/sprint. */}
      <div className="g3d-well relative mb-3 p-2.5">
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <span className="text-xs uppercase tracking-wider inline-flex items-center gap-1 font-bold flex-shrink-0" style={{ color: "var(--g3d-faint)" }}>
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

export default function AdminDashboard() {
  const [trainees, setTrainees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [assignmentResults, setAssignmentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);
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
  const [csatFor, setCsatFor] = useState(null);
  const [cardSettingsFor, setCardSettingsFor] = useState(null);

  // Assignment scores load lazily - only fetched once the Level distribution
  // section is first expanded, since it's a live Google Sheet round trip.
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

  useEffect(() => {
    (async () => {
      try {
        const [
          data,
          batchData,
          clientData,
          clientAssignData,
          projectAssignData,
          sprintAssignData,
          visitData,
        ] = await Promise.all([
          api.listTrainees(),
          api.listBatches().catch(() => []),
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

  const getAssignments = useCallback(
    (name) => {
      if (!name) return [];
      return assignmentResults[name.trim().toLowerCase()] || [];
    },
    [assignmentResults]
  );

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
                          onEditCsat={() => setCsatFor(t)}
                          onEditCardSettings={() => setCardSettingsFor(t)}
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

      {csatFor && (
        <CsatDialog
          trainee={csatFor}
          onClose={() => setCsatFor(null)}
          onSaved={(csat_score) =>
            setTrainees((prev) => prev.map((t) => (t.id === csatFor.id ? { ...t, csat_score } : t)))
          }
        />
      )}

      {cardSettingsFor && (
        <CardSettingsDialog
          trainee={cardSettingsFor}
          onClose={() => setCardSettingsFor(null)}
          onSaved={(enabled_cards) =>
            setTrainees((prev) =>
              prev.map((t) => (t.id === cardSettingsFor.id ? { ...t, enabled_cards } : t))
            )
          }
        />
      )}
    </AppShell>
  );
}
