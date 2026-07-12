import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchSheetModules } from "@/lib/sheet";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
  { to: "/admin/results", label: "Results", testId: "nav-results" },
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

  useEffect(() => {
    (async () => {
      try {
        const [tRes, mods] = await Promise.all([
          api.getTrainee(id),
          fetchSheetModules().catch(() => []),
        ]);
        setTrainee(tRes.trainee || null);
        setProgress(tRes.progress || []);
        setModules(mods || []);

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
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Status</p>
              <p className="mt-1 font-medium">{trainee.status || "—"}</p>
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
          {trainee.notes && (
            <div className="mt-6 p-4 rounded-xl bg-neutral-50 text-sm text-neutral-700">
              {trainee.notes}
            </div>
          )}
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-6">
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
    </AppShell>
  );
}
