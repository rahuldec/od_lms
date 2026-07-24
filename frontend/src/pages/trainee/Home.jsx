import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { fetchSheetModules } from "@/lib/sheet";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  FileText,
  Play,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const navItems = [{ to: "/trainee", label: "Training", testId: "nav-training" }];

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

export default function TraineeHome() {
  const { trainee } = useAuth();
  const [modules, setModules] = useState([]);
  const [progress, setProgress] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState(null);
  const [results, setResults] = useState([]);

  const reloadProgress = async () => {
    const res = await api.myProgress();
    const map = {};
    (res.progress || []).forEach((p) => (map[p.lesson_id] = p));
    setProgress(map);
  };

  useEffect(() => {
    if (!trainee) return;
    (async () => {
      try {
        const mods = await fetchSheetModules();
        setModules(mods);
        await reloadProgress();
        const allResults = await fetchAllAssignmentResults().catch(() => ({}));
        const key = (trainee.name || "").trim().toLowerCase();
        setAssignments(allResults[key] || []);
        const publishedResults = await api.listResults().catch(() => []);
        setResults(Array.isArray(publishedResults) ? publishedResults : []);
      } catch (e) {
        toast.error("Could not load training content");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id]);

  const stats = useMemo(() => {
    const lessons = modules.flatMap((m) => m.lessons.filter((l) => l.kind === "video"));
    const total = lessons.length;
    const watched = lessons.filter((l) => progress[l.id]?.watched).length;
    return { total, watched, pct: total ? (watched / total) * 100 : 0 };
  }, [modules, progress]);

  const openLesson = (lesson) => {
    if (lesson.kind === "assignment" && lesson.assignmentUrl) {
      window.open(lesson.assignmentUrl, "_blank");
      return;
    }
    if (lesson.kind === "video" && !lesson.videoEmbedUrl) {
      toast.info("No video link for this lesson yet");
      return;
    }
    if (lesson.kind === "review") {
      toast.info("Review session - no video");
      return;
    }
    setActiveLesson(lesson);
  };

  const closeLesson = () => {
    setActiveLesson(null);
  };

  const toggleWatched = async (lesson) => {
    const existing = progress[lesson.id];
    try {
      const updated = await api.upsertProgress({
        lesson_id: lesson.id,
        watched: !existing?.watched,
      });
      setProgress((prev) => ({ ...prev, [lesson.id]: updated }));
      toast.success(existing?.watched ? "Marked as unwatched" : "Marked as watched");
    } catch (e) {
      toast.error("Could not update");
    }
  };

  if (loading) {
    return (
      <AppShell navItems={navItems} subtitle="Trainee">
        <div className="min-h-[40vh] grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </AppShell>
    );
  }

  if (!trainee) {
    return (
      <AppShell navItems={navItems} subtitle="Trainee">
        <Card className="p-8 rounded-2xl">
          <p className="text-neutral-700">
            Your trainee profile is not set up yet. Please reach out to your HR to be added to the program.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell navItems={navItems} subtitle="Trainee">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Welcome back</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-4xl font-semibold tracking-tight">
            Hi, {trainee.name?.split(" ")[0]}.
          </h1>
          <span
            data-testid="trainee-level-badge"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
            style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
          >
            Level {trainee.current_level ?? 0}
          </span>
        </div>
        {trainee.level_since_date && (
          <p className="text-xs text-neutral-400 mt-1">
            Since {trainee.level_since_date}
          </p>
        )}
        {trainee.join_date && (
          <p className="text-sm font-medium text-neutral-500 mt-2">
            Day {Math.max(0, Math.floor((new Date() - new Date(trainee.join_date)) / (1000 * 60 * 60 * 24)))} of your journey
          </p>
        )}
        <p className="text-neutral-500 mt-2 max-w-xl">
          Your Okie Dokie ERP training program - modules, video lessons and assignments, all in one place.
        </p>
      </div>

      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Overall progress</p>
            <p className="text-5xl font-semibold mt-2 tabular-nums" data-testid="overall-progress-value">
              {stats.watched}
              <span className="text-neutral-300 text-3xl">/{stats.total}</span>
            </p>
          </div>
        </div>
        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-6">
          <div
            data-testid="overall-progress-bar"
            className="h-full rounded-full transition-all"
            style={{ width: `${stats.pct}%`, backgroundColor: "#E05A2B" }}
          />
        </div>
      </Card>

      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-10">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 mb-4">Assignment scores</p>
        {assignments.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {assignments.map((a) => {
              const color = a.passed ? "#16a34a" : "#dc2626";
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveAssignment(a)}
                  className="inline-flex items-center gap-2 text-sm border rounded-2xl px-4 py-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ borderColor: color + "40", backgroundColor: color + "10" }}
                >
                  <span className="font-medium text-neutral-700">{a.name}</span>
                  <span className="font-bold tabular-nums" style={{ color: color }}>
                    {a.score}/{a.total}
                  </span>
                  <span className="text-xs font-medium" style={{ color: color }}>
                    {a.passed ? "Pass" : "Fail"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No assignments attempted yet.</p>
        )}
      </Card>

      {results.length > 0 && (
        <Card className="rounded-2xl border-neutral-200/80 p-7 mb-10">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 mb-4">Results</p>
          <div className="flex flex-col gap-2">
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{r.title}</p>
                  <p className="text-xs text-neutral-500">
                    {r.cycle ? `${r.cycle} · ` : ""}
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-300 flex-shrink-0" />
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-8">
        {modules.map((mod) => {
          const modLessons = mod.lessons.filter((l) => l.kind === "video");
          const modWatched = modLessons.filter((l) => progress[l.id]?.watched).length;
          return (
            <section key={mod.id} data-testid={`module-${mod.order}`}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  <span className="text-neutral-400 mr-2">{String(mod.order).padStart(2, "0")}</span>
                  {mod.name}
                </h2>
                <span className="text-xs text-neutral-500">
                  {modWatched} / {modLessons.length} watched
                </span>
              </div>
              <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
                <ul className="divide-y divide-neutral-100">
                  {mod.lessons.map((l) => {
                    const p = progress[l.id];
                    const watched = !!p?.watched;
                    const isVideo = l.kind === "video";
                    const isAssignment = l.kind === "assignment";

                    const accentColor = isVideo ? "#1D9E75" : isAssignment ? "#BA7517" : "#a3a3a3";
                    const iconBg = isVideo ? "#E1F5EE" : isAssignment ? "#FAEEDA" : "#f5f5f5";
                    const iconColor = isVideo ? "#085041" : isAssignment ? "#633806" : "#a3a3a3";
                    const chipBg = isVideo ? "#E1F5EE" : isAssignment ? "#FAEEDA" : "#f5f5f5";
                    const chipColor = isVideo ? "#085041" : isAssignment ? "#633806" : "#a3a3a3";
                    const chipLabel = isVideo ? "Video" : isAssignment ? "Assignment" : "Review";

                    return (
                      <li
                        key={l.id}
                        data-testid={`lesson-${l.id}`}
                        className="px-5 py-4 flex items-center gap-3.5 hover:bg-neutral-50/60 cursor-pointer transition-colors"
                        style={{ borderLeft: `3px solid ${accentColor}` }}
                        onClick={() => openLesson(l)}
                      >
                        <div
                          className="h-8 w-8 rounded-full grid place-items-center flex-shrink-0"
                          style={{ backgroundColor: isVideo && watched ? accentColor : iconBg }}
                        >
                          {isVideo ? (
                            watched ? (
                              <CheckCircle2 className="h-4 w-4" style={{ color: "white" }} />
                            ) : (
                              <Play className="h-4 w-4" style={{ color: iconColor }} />
                            )
                          ) : isAssignment ? (
                            <FileText className="h-4 w-4" style={{ color: iconColor }} />
                          ) : (
                            <Circle className="h-4 w-4" style={{ color: iconColor }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{l.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {l.day}
                            {watched ? " · Watched" : ""}
                          </p>
                        </div>
                        <span
                          className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                          style={{ backgroundColor: chipBg, color: chipColor }}
                        >
                          {chipLabel}
                        </span>
                        <ChevronRight className="h-4 w-4 text-neutral-300 flex-shrink-0" />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>

      <AssignmentModal assignment={activeAssignment} onClose={() => setActiveAssignment(null)} />

      {activeLesson && (
        <div
          data-testid="video-modal"
          className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeLesson}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100">
              <div className="min-w-0">
                <p className="text-xs text-neutral-500 mb-0.5">
                  {activeLesson.moduleName} · {activeLesson.day}
                </p>
                <p className="font-semibold truncate">{activeLesson.title}</p>
              </div>
              <Button
                data-testid="close-video"
                variant="ghost"
                onClick={closeLesson}
                className="rounded-full"
              >
                Close
              </Button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                title={activeLesson.title}
                src={activeLesson.videoEmbedUrl}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="px-6 py-4 flex items-center justify-end bg-white">
              <Button
                data-testid="toggle-watched"
                onClick={() => toggleWatched(activeLesson)}
                className="rounded-full text-white"
                style={{ backgroundColor: "#E05A2B" }}
              >
                {progress[activeLesson.id]?.watched ? "Mark as unwatched" : "Mark as watched"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
