import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchSheetModules } from "@/lib/sheet";
import { fetchClients } from "@/lib/clients";
import AppShell from "@/components/AppShell";
import ClientAssignDialog from "@/components/ClientAssignDialog";
import ProjectAssignDialog from "@/components/ProjectAssignDialog";
import SprintAssignDialog from "@/components/SprintAssignDialog";
import RemarksDialog from "@/components/RemarksDialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Clock, XCircle, Briefcase, Layers, Rocket, MessageSquare, Plus, Hourglass } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { daysAtLevel } from "@/lib/levelHistory";

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

const fmtMinutes = (sec) => {
  const m = Math.floor((sec || 0) / 60);
  const s = Math.floor((sec || 0) % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
};

const scoreColor = (ratio) => {
  if (ratio >= 0.7) return "#16a34a";
  if (ratio >= 0.5) return "#d97706";
  return "#dc2626";
};

const SKIP_COLS = ["Added Time", "IP Address", "Name", "Overall Score", "Link"];

const ASSIGNMENTS = [
  {
    name: "SIS",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRdhlvmjnqv5YBTpK4oxX914j6HApyK26brmNyqqkIoKGDLJUPyigKBLOlgB4msgfEacRqTuDZtsU3C/pub?output=csv",
  },
  {
    name: "Fee Module",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vShKF5uOw7P4V-fuKcGVWCkqBlHHhmFAjH_U5v-rBzONjN9bq813_yQnAbsyOQBlfT6hIDDYxi_YJxz/pub?gid=0&single=true&output=csv",
  },
  {
    name: "Academic Module",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTiB9myHbpIiCVCK2Yikqy6VeQ_Lr6mt1XCdvQIxMdGQemIYpTp5UehEKN1GDiYQwRuBFB6tbuxGyzh/pub?gid=0&single=true&output=csv",
  },
  {
    name: "Attendance",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPHkFJjJ8CF7lXGPPNS1dAWpQwAVJ_EyIx-_afkvkSFZ0ggkowqwvuFkDOCzTlJfRx04Kf86RlOTo7/pub?output=csv",
  },
  {
    name: "Admission Module",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQVLCtO6rf5tG-E6AuD-zQrkdS4wRBMVyXPqdgHLzSrCunJgPvMHHZFpCGaWf11BAt_EikIxhDx2boc/pub?gid=0&single=true&output=csv",
  },
];

// Case-insensitive lookup of the first candidate column name that actually
// exists in a parsed CSV row.
const resolveColumn = (row, candidates) => {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.trim().toLowerCase() === candidate.trim().toLowerCase());
    if (match) return match;
  }
  return null;
};

const fetchAssignmentResult = async (assignment, traineeName) => {
  try {
    const res = await fetch(assignment.csvUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const row = parsed.data.find(
      (r) => (r["Name"] || "").trim().toLowerCase() === traineeName.trim().toLowerCase()
    );
    if (!row) return null;
    const scoreCol = assignment.scoreColCandidates
      ? resolveColumn(row, assignment.scoreColCandidates)
      : "Overall Score";
    const questions = assignment.noBreakdown
      ? []
      : parsed.meta.fields.filter((f) => !SKIP_COLS.includes(f));
    return { row, questions, scoreCol };
  } catch {
    return null;
  }
};

export default function TraineeDetail() {
  const { id } = useParams();
  const [trainee, setTrainee] = useState(null);
  const [progress, setProgress] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignmentResults, setAssignmentResults] = useState({});
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [expandedAssignment, setExpandedAssignment] = useState(null);
  const [clients, setClients] = useState([]);
  const [myClients, setMyClients] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [myProjects, setMyProjects] = useState([]);
  const [projectAssignOpen, setProjectAssignOpen] = useState(false);
  const [mySprints, setMySprints] = useState([]);
  const [sprintAssignOpen, setSprintAssignOpen] = useState(false);
  const [remarksOpen, setRemarksOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, mods, clientList, myClientRows, myProjectRows, mySprintRows] = await Promise.all([
          api.getTrainee(id),
          fetchSheetModules().catch(() => []),
          fetchClients().catch(() => []),
          api.getTraineeClients(id).catch(() => []),
          api.getTraineeProjects(id).catch(() => []),
          api.getTraineeSprints(id).catch(() => []),
        ]);
        setTrainee(tRes.trainee || null);
        setProgress(tRes.progress || []);
        setModules(mods || []);
        setClients(clientList || []);
        setMyClients(
          (myClientRows || []).map((r) => ({
            client_name: r.client_name,
            handling_mode: r.handling_mode || "solo",
          }))
        );
        setMyProjects(
          (myProjectRows || []).map((r) => ({
            project_name: r.project_name,
            handling_mode: r.handling_mode || "solo",
          }))
        );
        setMySprints(
          (mySprintRows || []).map((r) => ({
            sprint_name: r.sprint_name,
            sprint_type: r.sprint_type === "major" ? "major" : "minor",
            handling_mode: r.handling_mode || "solo",
            bugs_percent: r.bugs_percent || 0,
          }))
        );

        // Fetch all assignment CSVs in parallel
        if (tRes.trainee?.name) {
          const name = tRes.trainee.name;
          const results = await Promise.all(
            ASSIGNMENTS.map((a) => fetchAssignmentResult(a, name))
          );
          const map = {};
          ASSIGNMENTS.forEach((a, i) => { map[a.name] = results[i]; });
          setAssignmentResults(map);
        }
      } catch (e) {
        toast.error("Failed to load trainee");
      } finally {
        setLoading(false);
        setAssignmentsLoading(false);
      }
    })();
  }, [id]);

  const progressByLessonId = useMemo(() => {
    const m = {};
    progress.forEach((p) => (m[p.lesson_id] = p));
    return m;
  }, [progress]);

  const totalLessons = useMemo(
    () => modules.reduce((acc, m) => acc + m.lessons.filter((l) => l.kind === "video").length, 0),
    [modules]
  );

  const watchedCount = useMemo(() => progress.filter((p) => p.watched).length, [progress]);
  const totalSeconds = useMemo(() => progress.reduce((acc, p) => acc + (p.watch_seconds || 0), 0), [progress]);
  const daysAtL0 = useMemo(() => daysAtLevel(trainee, 0), [trainee]);

  if (loading) {
    return (
      <AppShell navItems={navItems} subtitle="Admin">
        <p className="text-neutral-400">Loading…</p>
      </AppShell>
    );
  }

  if (!trainee) {
    return (
      <AppShell navItems={navItems} subtitle="Admin">
        <p className="text-neutral-500">Trainee not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <Link
        to="/admin/trainees"
        className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900 mb-6"
        data-testid="back-to-trainees"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to trainees
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Trainee Info Card */}
        <Card className="lg:col-span-2 rounded-2xl border-neutral-200/80 p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Trainee</p>
              <h1 className="text-3xl font-semibold mt-1 tracking-tight">{trainee.name}</h1>
              <p className="text-sm text-neutral-500 mt-2">
                @{trainee.username} · {trainee.phone || "no phone"}
              </p>
            </div>
            <Badge className="rounded-full" style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}>
              Level {trainee.current_level ?? 0}
            </Badge>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Status</p>
              <p className="mt-1 font-medium">{trainee.status || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Department</p>
              <p className="mt-1 font-medium">{trainee.department || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Manager</p>
              <p className="mt-1 font-medium">{trainee.manager || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Joined</p>
              <p className="mt-1 font-medium">{trainee.join_date || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Phone</p>
              <p className="mt-1 font-medium">{trainee.phone || "—"}</p>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs uppercase tracking-wider text-neutral-500 inline-flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                Remarks
              </p>
              <button
                onClick={() => setRemarksOpen(true)}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5"
                style={{ color: "#E05A2B" }}
              >
                {trainee.notes ? "Edit" : <><Plus className="h-3 w-3" />Add</>}
              </button>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 text-sm whitespace-pre-wrap break-words">
              {trainee.notes ? (
                <span className="text-neutral-700">{trainee.notes}</span>
              ) : (
                <span className="text-neutral-400">No remarks yet</span>
              )}
            </div>
          </div>
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Client book */}
          <Card className="rounded-2xl border-neutral-200/80 p-7">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 inline-flex items-center gap-1.5">
                <Briefcase className="h-3 w-3" />
                Clients
              </p>
              <button
                onClick={() => setAssignOpen(true)}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5"
                style={{ color: "#E05A2B" }}
              >
                {myClients.length > 0 ? "Manage" : <><Plus className="h-3 w-3" />Assign</>}
              </button>
            </div>
            <p className="text-4xl font-semibold mt-2 tabular-nums">{myClients.length}</p>
            <p className="text-sm text-neutral-500 mt-1">assigned</p>
            {myClients.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {myClients.map((c) => (
                  <span
                    key={c.client_name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                  >
                    {c.client_name}
                    <span
                      className="text-[9px] uppercase tracking-wide"
                      style={{ color: c.handling_mode === "assisted" ? "#E05A2B" : "#a3a3a3" }}
                    >
                      {c.handling_mode === "assisted" ? "assisted" : "solo"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Project book */}
          <Card className="rounded-2xl border-neutral-200/80 p-7">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 inline-flex items-center gap-1.5">
                <Layers className="h-3 w-3" />
                Projects
              </p>
              <button
                onClick={() => setProjectAssignOpen(true)}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5"
                style={{ color: "#E05A2B" }}
              >
                {myProjects.length > 0 ? "Manage" : <><Plus className="h-3 w-3" />Assign</>}
              </button>
            </div>
            <p className="text-4xl font-semibold mt-2 tabular-nums">{myProjects.length}</p>
            <p className="text-sm text-neutral-500 mt-1">assigned</p>
            {myProjects.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {myProjects.map((p) => (
                  <span
                    key={p.project_name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                  >
                    {p.project_name}
                    <span
                      className="text-[9px] uppercase tracking-wide"
                      style={{ color: p.handling_mode === "assisted" ? "#E05A2B" : "#a3a3a3" }}
                    >
                      {p.handling_mode === "assisted" ? "assisted" : "solo"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Sprint book - a QA-team concept, hidden for CS trainees */}
          {trainee.department !== "CS" && (
          <Card className="rounded-2xl border-neutral-200/80 p-7">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 inline-flex items-center gap-1.5">
                <Rocket className="h-3 w-3" />
                Sprints
              </p>
              <button
                onClick={() => setSprintAssignOpen(true)}
                className="text-xs font-semibold hover:underline inline-flex items-center gap-0.5"
                style={{ color: "#E05A2B" }}
              >
                {mySprints.length > 0 ? "Manage" : <><Plus className="h-3 w-3" />Assign</>}
              </button>
            </div>
            <p className="text-4xl font-semibold mt-2 tabular-nums">{mySprints.length}</p>
            <p className="text-sm text-neutral-500 mt-1">
              assigned
              {mySprints.length > 0 && (
                <span style={{ color: "#dc2626" }}>
                  {" "}
                  · avg{" "}
                  {Math.round(
                    mySprints.reduce((sum, s) => sum + (s.bugs_percent || 0), 0) / mySprints.length
                  )}
                  % bugs
                </span>
              )}
            </p>
            {mySprints.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {mySprints.map((s) => (
                  <span
                    key={s.sprint_name}
                    title={`${s.bugs_percent || 0}% bugs found`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                  >
                    {s.sprint_name}
                    <span
                      className="text-[9px] uppercase tracking-wide"
                      style={{ color: s.sprint_type === "major" ? "#2563eb" : "#a3a3a3" }}
                    >
                      {s.sprint_type}
                    </span>
                    <span
                      className="text-[9px] uppercase tracking-wide"
                      style={{ color: s.handling_mode === "assisted" ? "#E05A2B" : "#a3a3a3" }}
                    >
                      {s.handling_mode === "assisted" ? "assisted" : "solo"}
                    </span>
                    {s.bugs_percent > 0 && (
                      <span className="text-[9px] font-semibold tabular-nums" style={{ color: "#dc2626" }}>
                        {s.bugs_percent}%
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </Card>
          )}

          {/* Days at Level 0 */}
          <Card className="rounded-2xl border-neutral-200/80 p-7" data-testid="days-at-level0-card">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 inline-flex items-center gap-1.5">
              <Hourglass className="h-3 w-3" />
              Days at Level 0
            </p>
            <p className="text-4xl font-semibold mt-2 tabular-nums">{daysAtL0}</p>
            <p className="text-sm text-neutral-500 mt-1">
              {(trainee.current_level ?? 0) === 0
                ? "still at Level 0"
                : "total across time spent at Level 0"}
            </p>
          </Card>

          {/* Video Progress */}
          <Card className="rounded-2xl border-neutral-200/80 p-7">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Progress</p>
            <p className="text-4xl font-semibold mt-2 tabular-nums">
              {watchedCount}
              <span className="text-neutral-300 text-2xl">/{totalLessons}</span>
            </p>
            <p className="text-sm text-neutral-500 mt-1">lessons watched</p>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-5">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${totalLessons ? (watchedCount / totalLessons) * 100 : 0}%`,
                  backgroundColor: "#E05A2B",
                }}
              />
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
              <Clock className="h-4 w-4 text-neutral-400" />
              Total watch time: <span className="font-medium">{fmtMinutes(totalSeconds)}</span>
            </div>
          </Card>

          {/* Assignment Cards — one per assignment */}
          {ASSIGNMENTS.map((a) => {
            const result = assignmentResults[a.name];
            const score = result && result.scoreCol ? parseFloat(result.row[result.scoreCol] || 0) : null;
            const total = a.totalMarks || (result ? result.questions.length : 15);
            const passThreshold = a.passThreshold != null ? a.passThreshold / total : 0.7;
            const ratio = score !== null ? score / total : null;
            const color = ratio !== null ? scoreColor(ratio) : "#94a3b8";
            const link = result ? result.row["Link"] : null;
            const isExpanded = expandedAssignment === a.name;

            return (
              <Card key={a.name} className="rounded-2xl border-neutral-200/80 p-7">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{a.name}</p>
                {assignmentsLoading ? (
                  <p className="text-sm text-neutral-400 mt-2">Loading...</p>
                ) : score !== null ? (
                  <>
                    <p className="text-4xl font-semibold mt-2 tabular-nums">
                      {score}
                      <span className="text-neutral-300 text-2xl">/{total}</span>
                    </p>
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-4">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(score / total) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <p className="text-sm mt-3 font-medium" style={{ color }}>
                      {ratio >= passThreshold ? "✓ Pass" : "✗ Needs Improvement"}
                    </p>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                      >
                        View submission →
                      </a>
                    )}
                    {!a.noBreakdown && (
                      <button
                        onClick={() => setExpandedAssignment(isExpanded ? null : a.name)}
                        className="mt-4 text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-1 w-full"
                      >
                        {isExpanded ? "▲ Hide breakdown" : "▼ Show breakdown"}
                      </button>
                    )}
                    {!a.noBreakdown && isExpanded && (
                      <ul className="mt-3 divide-y divide-neutral-100 border border-neutral-100 rounded-xl overflow-hidden">
                        {result.questions.map((q, i) => {
                          const ans = (result.row[q] || "").trim().toLowerCase();
                          const correct = ans === "yes";
                          return (
                            <li key={i} className="px-3 py-2 flex items-start gap-2 text-xs">
                              {correct ? (
                                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                              )}
                              <p className="flex-1 text-neutral-700">{q}</p>
                              <span className={`font-medium ${correct ? "text-green-600" : "text-red-500"}`}>
                                {correct ? "Yes" : "No"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-400 mt-2">Not attempted yet</p>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Lesson Activity */}
      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <h2 className="text-xl font-semibold mb-1">Lesson activity</h2>
        <p className="text-sm text-neutral-500 mb-6">Watched lessons and time spent per video.</p>
        <div className="space-y-6">
          {modules.map((mod) => (
            <div key={mod.id}>
              <p className="text-sm font-semibold text-neutral-900 mb-2">
                {mod.order}. {mod.name}
              </p>
              <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl overflow-hidden">
                {mod.lessons.map((l) => {
                  const p = progressByLessonId[l.id];
                  const watched = !!p?.watched;
                  return (
                    <li key={l.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                      {watched ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#E05A2B" }} />
                      ) : (
                        <Circle className="h-4 w-4 text-neutral-300 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{l.title}</p>
                        <p className="text-xs text-neutral-400">{l.day} · {l.kind}</p>
                      </div>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {fmtMinutes(p?.watch_seconds || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    
      {assignOpen && (
        <ClientAssignDialog
          trainee={trainee}
          clients={clients}
          assigned={myClients}
          onClose={() => setAssignOpen(false)}
          onSaved={setMyClients}
        />
      )}

      {projectAssignOpen && (
        <ProjectAssignDialog
          trainee={trainee}
          assigned={myProjects}
          onClose={() => setProjectAssignOpen(false)}
          onSaved={setMyProjects}
        />
      )}

      {sprintAssignOpen && (
        <SprintAssignDialog
          trainee={trainee}
          assigned={mySprints}
          onClose={() => setSprintAssignOpen(false)}
          onSaved={setMySprints}
        />
      )}

      {remarksOpen && (
        <RemarksDialog
          trainee={trainee}
          onClose={() => setRemarksOpen(false)}
          onSaved={(notes) => setTrainee((prev) => ({ ...prev, notes }))}
        />
      )}
    </AppShell>
  );
}
