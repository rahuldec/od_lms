import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import { fetchClients, groupAssignmentsByTrainee, buildSheetSync } from "@/lib/clients";
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
import { Users, TrendingUp, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, X, BarChart3, Layers, Briefcase, MapPin, Rocket, MessageSquare, Info, AlertTriangle, Plus, Settings, Smile, Clock, RefreshCw } from "lucide-react";
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
  { to: "/admin/payroll", label: "Payroll", testId: "nav-payroll" },
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
const levelLimitFor = (t) => LEVEL_DAY_LIMITS[t.current_level ?? 0] ?? 60;
const needsAttention = (t) => daysAtCurrentLevel(t) > levelLimitFor(t);
// "About to cross" - within the last 20% of the expected duration but not
// over it yet (that's needsAttention's job). A separate, earlier warning so
// an admin can look before it's actually overdue, not just after.
const APPROACHING_FRACTION = 0.8;
const needsAttentionSoon = (t) => {
  const days = daysAtCurrentLevel(t);
  const limit = levelLimitFor(t);
  return days >= limit * APPROACHING_FRACTION && days <= limit;
};

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
  sheetClients = [],
  sheetClientCount = 0,
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
  const [visitsExpanded, setVisitsExpanded] = useState(false);

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

  // Build visit data for two-col layout
  const visited = visitRows
    .filter((v) => v.visit_count > 0)
    .map((v) => ({ client_name: v.client_name, count: v.visit_count }))
    .sort((a, b) => b.count - a.count);
  const totalVisits = visited.reduce((s, v) => s + v.count, 0);
  const PREVIEW = 5;
  const visitMap = {};
  visitRows.forEach((v) => { visitMap[v.client_name.trim().toLowerCase()] = v.visit_count || 0; });

  return (
    <div className="g3d-scope g3d-card overflow-hidden" style={{ background: "#F5F5F7" }}>

      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4" style={{ background: "#fff", borderBottom: "1px solid var(--g3d-border)" }}>
        <div
          className="g3d-avatar flex-shrink-0 grid place-items-center text-white font-semibold"
          style={{ width: 48, height: 48, borderRadius: 13, fontSize: 18 }}
        >
          {t.name?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/admin/trainees/${t.id}`}
                className="text-lg font-semibold hover:underline truncate block leading-tight"
                style={{ color: "var(--g3d-ink)" }}
              >
                {t.name}
              </Link>
              <p className="text-xs mt-0.5" style={{ color: "var(--g3d-faint)" }}>@{t.username}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {days !== null && (
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums leading-none" style={{ color: "var(--g3d-ink)" }}>{days}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--g3d-faint)" }}>days in program</div>
                </div>
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
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            <span className="g3d-chip"
              style={t.status === "Active" ? { "--fill": "var(--g3d-good-bg)", "--ink2": "var(--g3d-good-ink)" } : undefined}>
              {t.status}
            </span>
            <span className="g3d-chip solid"
              style={flagged ? { "--fill": "var(--g3d-bad-bg)", color: "var(--g3d-bad-ink)" } : undefined}
              title={flagged
                ? `${levelDays} days at Level ${t.current_level ?? 0} — over the expected ${LEVEL_DAY_LIMITS[t.current_level ?? 0] ?? 60}`
                : `${levelDays} day${levelDays === 1 ? "" : "s"} at Level ${t.current_level ?? 0}`}>
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
              <span className="g3d-chip" style={t.department === "QA"
                ? { "--fill": "var(--g3d-qa-bg)", "--ink2": "var(--g3d-qa-ink)" }
                : { "--fill": "var(--g3d-cs-bg)", "--ink2": "var(--g3d-cs-ink)" }}>
                {t.department}
              </span>
            )}
            {t.join_date && (
              <span className="g3d-chip" title="Date of joining">
                <Clock className="h-2.5 w-2.5" /> {fmtDate(t.join_date)}
              </span>
            )}
            {latestPromotion && (
              <span className="inline-flex items-center gap-0.5 text-xs ml-auto" style={{ color: "var(--g3d-faint)" }}>
                <TrendingUp className="h-3 w-3" />
                {fmtDate(latestPromotion.effective_date || latestPromotion.at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Level timeline ── */}
      <div className="px-5 py-3" style={{ background: "#fff", borderBottom: "1px solid var(--g3d-border)" }}>
        <LevelTimeline trainee={t} variant="glass3d" />

      </div>

      {/* ── Clients | Visits | Learning — 3-col ── */}
      <div className="grid mx-3 mt-3 rounded-xl overflow-hidden" style={{
        gridTemplateColumns: "1fr 1fr 1fr",
        background: "#fff",
        border: "1px solid var(--g3d-border)",
      }}>

        {/* Clients */}
        {cardsEnabled.clients && (
          <div className="px-4 pt-3 pb-4 min-w-0 flex flex-col" style={{ borderRight: "1px solid var(--g3d-border)" }}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
                <Briefcase className="h-3 w-3" /> Clients
              </span>
              <button onClick={onAssignClients} data-testid={`assign-clients-${t.id}`}
                className="text-xs font-semibold hover:underline" style={{ color: "var(--g3d-accent)" }}>
                {myClients.length > 0 ? "Manage" : "+ Assign"}
              </button>
            </div>
            {/* Big stats — count + total billing */}
            {(() => {
              const totalBilling = sheetClients.reduce((s, c) => s + (c.billing || 0), 0);
              const billingLabel = totalBilling >= 100000
                ? `₹${(totalBilling / 100000).toFixed(1)}L`
                : totalBilling > 0 ? `₹${Math.round(totalBilling / 1000)}K` : null;
              return (
                <div className="flex items-end gap-4 mb-3">
                  <div>
                    <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--g3d-accent)" }}>
                      {sheetClientCount > 0 ? sheetClientCount : myClients.length}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--g3d-faint)" }}>clients</div>
                  </div>
                  {billingLabel && (
                    <div>
                      <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--g3d-ink)" }}>
                        {billingLabel}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--g3d-faint)" }}>total billing</div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Sheet client list with billing */}
            {sheetClients.length === 0 ? (
              <p className="text-sm font-medium" style={{ color: "var(--g3d-faint)" }}>No clients in sheet</p>
            ) : (
              <div className="flex flex-col gap-0">
                {sheetClients.map((c, i) => (
                  <div key={c.name}
                    className="py-2 flex items-center justify-between gap-2"
                    style={{ borderTop: i > 0 ? "1px solid var(--g3d-border)" : "none" }}>
                    <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--g3d-ink)" }}>{c.name}</span>
                    {c.billing != null && c.billing > 0 && (
                      <span className="text-xs font-semibold flex-shrink-0 tabular-nums" style={{ color: "var(--g3d-faint)" }}>
                        ₹{c.billing >= 100000 ? `${(c.billing / 100000).toFixed(1)}L` : `${Math.round(c.billing / 1000)}K`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Visits */}
        {cardsEnabled.visits && (
          <div className="px-4 pt-3 pb-4 min-w-0 flex flex-col" style={{ borderRight: "1px solid var(--g3d-border)" }}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
                <MapPin className="h-3 w-3" /> Visits
              </span>
              <button onClick={onLogVisits} data-testid={`log-visits-${t.id}`}
                className="text-xs font-semibold hover:underline" style={{ color: "var(--g3d-accent)" }}>
                {visited.length > 0 ? "Manage" : "+ Log"}
              </button>
            </div>
            {/* Big stat */}
            <div className="mb-3">
              <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--g3d-accent)" }}>
                {totalVisits}
              </span>
            </div>
            {/* List */}
            {visited.length === 0 ? (
              <p className="text-sm font-medium" style={{ color: "var(--g3d-faint)" }}>No visits logged</p>
            ) : (
              <>
                <div className="flex flex-col gap-0">
                  {(visitsExpanded ? visited : visited.slice(0, PREVIEW)).map((c, i) => (
                    <div key={c.client_name}
                      className="py-2 flex items-center justify-between gap-2"
                      style={{ borderTop: i > 0 ? "1px solid var(--g3d-border)" : "none" }}>
                      <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--g3d-ink)" }}>{c.client_name}</span>
                      <span className="inline-flex items-center justify-center rounded-md text-[11px] font-semibold flex-shrink-0"
                        style={{ minWidth: 22, height: 20, padding: "0 5px", background: "var(--g3d-accent-soft)", color: "var(--g3d-accent)" }}>
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
                {visited.length > PREVIEW && (
                  <button onClick={() => setVisitsExpanded((v) => !v)}
                    className="mt-2 text-xs font-semibold hover:underline w-full text-center"
                    style={{ color: "var(--g3d-accent)" }}>
                    {visitsExpanded ? "Show less" : `+${visited.length - PREVIEW} more`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Learning phase */}
        <div className="px-4 pt-3 pb-4 min-w-0 flex flex-col">
          {/* Section header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
              <BarChart3 className="h-3 w-3" /> Learning
            </span>
          </div>
          {/* Big overall score */}
          {assignments.length > 0 && (
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="text-3xl font-bold tabular-nums leading-none"
                style={{ color: avgPct != null && avgPct >= 60 ? "var(--g3d-good-ink)" : avgPct != null ? "var(--g3d-bad-ink)" : "var(--g3d-ink)" }}>
                {avgPct != null ? `${avgPct}%` : `${passedCount}/${assignments.length}`}
              </span>
              {avgPct != null && (
                <span className="text-xs font-medium" style={{ color: "var(--g3d-faint)" }}>
                  avg · {passedCount}/{assignments.length} passed
                </span>
              )}
            </div>
          )}
          {/* Assignment list */}
          {assignmentsLoading ? (
            <p className="text-sm font-medium" style={{ color: "var(--g3d-faint)" }}>Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm font-medium" style={{ color: "var(--g3d-faint)" }}>No assignments yet</p>
          ) : (
            <>
              {(scoresOpen ? assignments : assignments.slice(0, PREVIEW)).map((a, i) => (
                <button key={a.id} onClick={() => onOpenAssignment(a)}
                  className="w-full text-left flex items-center justify-between py-2 hover:opacity-80 transition-opacity"
                  style={{ borderTop: i > 0 ? "1px solid var(--g3d-border)" : "none" }}>
                  <span className="text-sm font-medium truncate flex-1 mr-2" style={{ color: "var(--g3d-ink)" }}>{a.name}</span>
                  <span className="text-[11px] font-bold tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded"
                    style={a.passed
                      ? { background: "var(--g3d-good-bg)", color: "var(--g3d-good-ink)" }
                      : { background: "var(--g3d-bad-bg)", color: "var(--g3d-bad-ink)" }}>
                    {a.score != null && a.total != null ? `${a.score}/${a.total}` : a.passed ? "Pass" : "Fail"}
                  </span>
                </button>
              ))}
              {assignments.length > PREVIEW && (
                <button onClick={() => setScoresOpen((v) => !v)}
                  className="mt-2 text-xs font-semibold hover:underline w-full text-center"
                  style={{ color: "var(--g3d-accent)" }}>
                  {scoresOpen ? "Show less" : `+${assignments.length - PREVIEW} more`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Projects ── */}
      {cardsEnabled.projects && (
        <div className="px-4 py-4 mx-3 mt-3 rounded-xl" style={{ background: "#fff", border: "1px solid var(--g3d-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
              <Layers className="h-3 w-3" /> Projects
            </span>
            <button onClick={onAssignProjects} data-testid={`assign-projects-${t.id}`}
              className="text-xs font-semibold hover:underline inline-flex items-center gap-1" style={{ color: "var(--g3d-accent)" }}>
              {myProjects.length > 0 ? "Manage" : <><Plus className="h-3 w-3" /> Assign</>}
            </button>
          </div>
          {myProjects.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--g3d-faint)" }}>No projects assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {myProjects.map((p) => (
                <span key={p.project_name} className="g3d-pill text-sm">{p.project_name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sprints ── */}
      {cardsEnabled.sprints && (
        <div className="px-4 py-4 mx-3 mt-3 rounded-xl" style={{ background: "#fff", border: "1px solid var(--g3d-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
              <Rocket className="h-3 w-3" /> Sprints
              {mySprints.length > 0 && (
                <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--g3d-bad-ink)" }}>
                  · avg {avgBugsPercent(mySprints)}% bugs
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {mySprints.length > 0 && (
                <button onClick={() => setSprintsOpen((v) => !v)} style={{ color: "var(--g3d-faint)" }}>
                  <Info className="h-3 w-3" />
                </button>
              )}
              <button onClick={onAssignSprints} data-testid={`assign-sprints-${t.id}`}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-1" style={{ color: "var(--g3d-accent)" }}>
                {mySprints.length > 0 ? "Manage" : <><Plus className="h-3 w-3" /> Assign</>}
              </button>
            </div>
          </div>
          {mySprints.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--g3d-faint)" }}>No sprints assigned</p>
          ) : sprintsOpen ? (
            <div className="flex flex-wrap gap-1.5">
              {mySprints.map((s) => (
                <span key={s.sprint_name} className="g3d-pill text-sm"
                  title={`${s.sprint_name} · ${s.sprint_type} · ${s.bugs_percent || 0}% bugs`}>
                  {s.sprint_name}
                  <span className="text-[10px] font-semibold uppercase ml-1"
                    style={{ color: s.sprint_type === "major" ? "var(--g3d-batch-ink)" : "var(--g3d-faint)" }}>
                    {s.sprint_type}
                  </span>
                  {s.bugs_percent > 0 && (
                    <span className="text-[10px] font-semibold ml-1" style={{ color: "var(--g3d-bad-ink)" }}>
                      {s.bugs_percent}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ── CSAT ── */}
      {cardsEnabled.csat && (
        <div className="px-4 py-3 mx-3 mt-3 rounded-xl flex items-center justify-between" style={{ background: "#fff", border: "1px solid var(--g3d-border)" }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest inline-flex items-center gap-1" style={{ color: "var(--g3d-faint)" }}>
            <Smile className="h-3 w-3" /> CSAT
            {t.csat_score != null && (
              <span className="ml-2 text-base font-semibold tabular-nums" style={{ color: "var(--g3d-accent)" }}>{t.csat_score}%</span>
            )}
          </span>
          <button onClick={onEditCsat} data-testid={`edit-csat-${t.id}`}
            className="text-xs font-semibold hover:underline inline-flex items-center gap-1" style={{ color: "var(--g3d-accent)" }}>
            {t.csat_score != null ? "Edit" : <><Plus className="h-3 w-3" /> Add</>}
          </button>
        </div>
      )}

      {/* ── Remarks footer ── */}
      <div className="px-4 py-3 mx-3 mt-3 mb-3 rounded-xl flex items-center gap-2" style={{ background: "#fff", border: "1px solid var(--g3d-border)" }}>
        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--g3d-faint)" }} />
        <p className="text-sm flex-1 min-w-0 truncate" style={{ color: t.notes ? "var(--g3d-soft)" : "var(--g3d-faint)" }}>
          {t.notes || "No remarks yet"}
        </p>
        <button onClick={onEditRemarks} data-testid={`edit-remarks-${t.id}`}
          className="text-xs font-semibold hover:underline flex-shrink-0" style={{ color: "var(--g3d-accent)" }}>
          {t.notes ? "Edit" : "+ Add"}
        </button>
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
  const [syncing, setSyncing] = useState(false);
  const [syncingVisits, setSyncingVisits] = useState(false);

  const syncClientsFromSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const freshClients = await fetchClients({ force: true });
      const syncs = buildSheetSync(trainees, freshClients);
      if (syncs.length === 0) {
        toast.info("No trainees matched sheet owners — check that Team names match trainee names.");
        return;
      }
      await Promise.all(
        syncs.map(({ traineeId, clientNames }) =>
          api.setTraineeClients(
            traineeId,
            clientNames.map((c) => ({ client_name: c, handling_mode: "assisted" }))
          )
        )
      );
      const updated = await api.listClientAssignments();
      setClientAssignments(Array.isArray(updated) ? updated : []);
      const total = syncs.reduce((s, x) => s + x.clientNames.length, 0);
      toast.success(`Synced ${total} client${total !== 1 ? "s" : ""} across ${syncs.length} trainee${syncs.length !== 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(`Sync failed: ${e?.response?.data?.detail || e?.message || "unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [trainees]);

  const syncVisitsFromOdmom = useCallback(async () => {
    setSyncingVisits(true);
    try {
      const ODMOM_URL = "https://imjrlgzjofzxerqfcnov.supabase.co";
      const ODMOM_KEY = "sb_publishable_vV0-uDh-g09KJJ-hQVStJw_R7uhQ_yM";
      const NAME_ALIASES = {
        "akshat wahi": "akshat",
        "vansh saini": "vansh",
        "aadhar mittal": "aadhar",
        "ashish kumar": "ashish",
        "lalit garg": "lalit",
        "tinku singh": "tinku",
        "bhavey": "bhavey saluja",
        "tanvi": "tanvi gupta",
      };
      const SPLIT_RE = /\s*(?:,|&|\band\b)\s*/gi;

      const normalize = (raw) => {
        const clean = raw.trim().toLowerCase();
        return NAME_ALIASES[clean] ?? clean;
      };
      const splitEmployees = (raw) =>
        raw.split(SPLIT_RE).map((p) => normalize(p.trim())).filter(Boolean);

      // Fetch all moms rows
      let rows = [];
      let offset = 0;
      while (true) {
        const res = await fetch(
          `${ODMOM_URL}/rest/v1/moms?select=employee_name,client_name`,
          {
            headers: {
              apikey: ODMOM_KEY,
              Authorization: `Bearer ${ODMOM_KEY}`,
              "Range-Unit": "items",
              Range: `${offset}-${offset + 999}`,
            },
          }
        );
        if (!res.ok) throw new Error(`odmom fetch failed: ${res.status}`);
        const batch = await res.json();
        rows = rows.concat(batch);
        if (batch.length < 1000) break;
        offset += 1000;
      }

      // Count visits per (traineeNorm, clientName)
      const counts = {};
      for (const row of rows) {
        const empRaw = (row.employee_name || "").trim();
        const client = (row.client_name || "").trim();
        if (!empRaw || !client || empRaw.toLowerCase() === "test") continue;
        for (const tn of splitEmployees(empRaw)) {
          if (!counts[tn]) counts[tn] = {};
          counts[tn][client] = (counts[tn][client] || 0) + 1;
        }
      }

      // Build trainee lookup
      const traineeByName = {};
      (trainees || []).forEach((t) => {
        if (t?.name) traineeByName[t.name.trim().toLowerCase()] = t;
      });

      // Push to backend
      let pushed = 0;
      await Promise.all(
        Object.entries(counts).map(async ([tnNorm, clientMap]) => {
          const trainee = traineeByName[tnNorm];
          if (!trainee) return;
          for (const [clientName, count] of Object.entries(clientMap)) {
            await api.setClientVisit(trainee.id, clientName, count);
            pushed++;
          }
        })
      );

      // Refresh visit data
      const updated = await api.listClientVisits();
      setClientVisits(Array.isArray(updated) ? updated : []);

      toast.success(`Synced ${pushed} visit record${pushed !== 1 ? "s" : ""} from odmom`);
    } catch (e) {
      toast.error(`Visit sync failed: ${e?.message || "unknown error"}`);
    } finally {
      setSyncingVisits(false);
    }
  }, [trainees]);

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

  // Clients from the CS Team Plan sheet grouped by trainee id.
  const sheetClientsByTraineeId = useMemo(() => {
    const byName = {};
    (clients || []).forEach((c) => {
      if (!c.traineeOwner) return;
      const key = c.traineeOwner.trim().toLowerCase();
      if (!byName[key]) byName[key] = [];
      byName[key].push(c);
    });
    const ALIASES = { "akshat wahi": "akshat", "vansh saini": "vansh" };
    const result = {};
    (trainees || []).forEach((t) => {
      const raw = t.name.trim().toLowerCase();
      const resolved = ALIASES[raw] ?? raw;
      result[t.id] = byName[resolved] || byName[raw] || [];
    });
    return result;
  }, [clients, trainees]);

  const sheetClientCountByTraineeId = useMemo(() => {
    const result = {};
    Object.entries(sheetClientsByTraineeId).forEach(([id, list]) => { result[id] = list.length; });
    return result;
  }, [sheetClientsByTraineeId]);

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

  // Sales trainees don't go through the CS/QA Level 0-3 curriculum (they have
  // their own Sales Training track with no assignments), and anyone already
  // promoted to ARM/RM has graduated past the Level ladder entirely - both
  // are excluded from the Level distribution view specifically.
  const levelEligibleTrainees = filteredTrainees.filter(
    (t) => t.department !== "Sales" && !t.rm_status
  );
  const levelTotal = levelEligibleTrainees.length;

  const levelGroups = [0, 1, 2, 3].map((lvl) => ({
    level: lvl,
    trainees: levelEligibleTrainees
      .filter((t) => (t.current_level ?? 0) === lvl)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  }));

  // Level-duration alerts - Sales/ARM/RM trainees are excluded, same as the
  // Level distribution above, since the day limits don't apply to them.
  const crossedAlerts = levelEligibleTrainees
    .filter(needsAttention)
    .sort((a, b) => (daysAtCurrentLevel(b) - levelLimitFor(b)) - (daysAtCurrentLevel(a) - levelLimitFor(a)));
  const approachingAlerts = levelEligibleTrainees
    .filter(needsAttentionSoon)
    .sort((a, b) => daysAtCurrentLevel(b) / levelLimitFor(b) - daysAtCurrentLevel(a) / levelLimitFor(a));

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

      {(crossedAlerts.length > 0 || approachingAlerts.length > 0) && (
        <Card className="rounded-2xl border-neutral-200/80 p-6 mb-10" data-testid="level-alerts">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-base font-semibold">Level duration alerts</h2>
          </div>
          <div className="space-y-2">
            {crossedAlerts.map((t) => {
              const over = daysAtCurrentLevel(t) - levelLimitFor(t);
              return (
                <Link
                  key={t.id}
                  to={`/admin/trainees/${t.id}`}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-900">{t.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                    <AlertTriangle className="h-3 w-3" />
                    L{t.current_level ?? 0} - {over} day{over === 1 ? "" : "s"} over
                  </span>
                </Link>
              );
            })}
            {approachingAlerts.map((t) => {
              const days = daysAtCurrentLevel(t);
              const limit = levelLimitFor(t);
              return (
                <Link
                  key={t.id}
                  to={`/admin/trainees/${t.id}`}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-900">{t.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                    <Clock className="h-3 w-3" />
                    L{t.current_level ?? 0} - {days}/{limit} days, approaching limit
                  </span>
                </Link>
              );
            })}
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

      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Level distribution</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Click a level to see trainees, their clients, assignment scores and promotion history.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <span>{levelTotal} trainees</span>
            <span className="text-neutral-200">|</span>
            <button
              onClick={syncClientsFromSheet}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 font-semibold disabled:opacity-50 hover:opacity-80 transition-opacity"
              style={{ color: "#E05A2B" }}
              title="Auto-assign clients from the CS Team Plan sheet (matches Team column to trainee names)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync from sheet"}
            </button>
            <span className="text-neutral-200">|</span>
            <button
              onClick={syncVisitsFromOdmom}
              disabled={syncingVisits || loading}
              className="inline-flex items-center gap-1.5 font-semibold disabled:opacity-50 hover:opacity-80 transition-opacity"
              style={{ color: "#E05A2B" }}
              title="Fetch visit counts from odmom portal and update this LMS"
            >
              <MapPin className={`h-3.5 w-3.5 ${syncingVisits ? "animate-spin" : ""}`} />
              {syncingVisits ? "Syncing…" : "Sync visits"}
            </button>
            <span className="text-neutral-200">|</span>
            <Link to="/admin/clients" className="font-semibold" style={{ color: "#E05A2B" }}>
              Manage clients &rarr;
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {levelGroups.map(({ level, trainees: lvlTrainees }) => {
            const pct = levelTotal ? Math.round((lvlTrainees.length / levelTotal) * 100) : 0;
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
                          sheetClients={sheetClientsByTraineeId[t.id] || []}
                          sheetClientCount={sheetClientCountByTraineeId[t.id] || 0}
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
