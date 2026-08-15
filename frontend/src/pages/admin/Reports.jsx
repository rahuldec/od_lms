import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import { getLevelPeriods, toDateOnly, daysBetween, daysAtCurrentLevel } from "@/lib/levelHistory";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import {
  Download,
  X,
  Briefcase,
  Layers,
  Rocket,
  MessageSquare,
  MapPin,
  AlertTriangle,
} from "lucide-react";

const ORANGE = "#E05A2B";

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
  const [clientAssignments, setClientAssignments] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [sprintAssignments, setSprintAssignments] = useState([]);
  const [clientVisits, setClientVisits] = useState([]);
  const [assignmentResults, setAssignmentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailFor, setDetailFor] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [
          traineeData,
          clientData,
          projectData,
          sprintData,
          visitData,
          assignmentData,
        ] = await Promise.all([
          api.listTrainees(),
          api.listClientAssignments().catch(() => []),
          api.listProjectAssignments().catch(() => []),
          api.listSprintAssignments().catch(() => []),
          api.listClientVisits().catch(() => []),
          fetchAllAssignmentResults().catch(() => ({})),
        ]);
        setTrainees(Array.isArray(traineeData) ? traineeData : []);
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

  const exportPdf = () => window.print();
  const attentionCount = rows.filter((r) => r.needsAttention).length;

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Reports</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Since Level 1</h1>
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
