import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSheetModules } from "@/lib/sheet";
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

// Local-only watched tracking, scoped to this browser. Not tied to any
// identity and never sent anywhere - purely so a visitor's progress
// survives a page refresh.
const STORAGE_KEY = "od-public-learn-watched";

const loadWatched = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveWatched = (map) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
};

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-neutral-200/70">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/learn" className="flex items-center gap-3" data-testid="brand">
          <div
            className="h-8 w-8 rounded-xl grid place-items-center text-white text-xs font-semibold"
            style={{ backgroundColor: "#E05A2B" }}
          >
            OD
          </div>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              Okie Dokie
            </p>
            <p className="text-sm font-semibold -mt-0.5">Learning Library</p>
          </div>
        </Link>
        <span className="text-xs text-neutral-500 hidden sm:block">
          Open access &middot; no login required
        </span>
      </div>
    </header>
  );
}

export default function PublicLearn() {
  const [modules, setModules] = useState([]);
  const [watched, setWatched] = useState(loadWatched);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const mods = await fetchSheetModules();
        setModules(mods);
      } catch (e) {
        toast.error("Could not load training content");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const lessons = modules.flatMap((m) => m.lessons.filter((l) => l.kind === "video"));
    const total = lessons.length;
    const watchedCount = lessons.filter((l) => watched[l.id]).length;
    return { total, watched: watchedCount, pct: total ? (watchedCount / total) * 100 : 0 };
  }, [modules, watched]);

  const openLesson = (lesson) => {
    if (lesson.kind === "assignment") {
      // Assignments stay out of the public view - they're for enrolled
      // trainees being scored, not anonymous visitors.
      toast.info("Assignments are only available to enrolled trainees");
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

  const closeLesson = () => setActiveLesson(null);

  const toggleWatched = (lesson) => {
    setWatched((prev) => {
      const next = { ...prev, [lesson.id]: !prev[lesson.id] };
      saveWatched(next);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <PublicHeader />
        <div className="min-h-[40vh] grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PublicHeader />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Open learning</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">
            Okie Dokie ERP Training
          </h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Browse modules and video lessons. No account needed - your watched
            progress is saved only on this device.
          </p>
        </div>

        <Card className="rounded-2xl border-neutral-200/80 p-7 mb-10">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Your progress</p>
              <p className="text-5xl font-semibold mt-2 tabular-nums">
                {stats.watched}
                <span className="text-neutral-300 text-3xl">/{stats.total}</span>
              </p>
            </div>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-6">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${stats.pct}%`, backgroundColor: "#E05A2B" }}
            />
          </div>
        </Card>

        <div className="space-y-8">
          {modules.map((mod) => {
            const modLessons = mod.lessons.filter((l) => l.kind === "video");
            const modWatched = modLessons.filter((l) => watched[l.id]).length;
            return (
              <section key={mod.id}>
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
                    {mod.lessons
                      .filter((l) => l.kind !== "assignment")
                      .map((l) => {
                        const isWatched = !!watched[l.id];
                        const isVideo = l.kind === "video";

                        const accentColor = isVideo ? "#1D9E75" : "#a3a3a3";
                        const iconBg = isVideo ? "#E1F5EE" : "#f5f5f5";
                        const iconColor = isVideo ? "#085041" : "#a3a3a3";
                        const chipBg = isVideo ? "#E1F5EE" : "#f5f5f5";
                        const chipColor = isVideo ? "#085041" : "#a3a3a3";
                        const chipLabel = isVideo ? "Video" : "Review";

                        return (
                          <li
                            key={l.id}
                            className="px-5 py-4 flex items-center gap-3.5 hover:bg-neutral-50/60 cursor-pointer transition-colors"
                            style={{ borderLeft: `3px solid ${accentColor}` }}
                            onClick={() => openLesson(l)}
                          >
                            <div
                              className="h-8 w-8 rounded-full grid place-items-center flex-shrink-0"
                              style={{ backgroundColor: isVideo && isWatched ? accentColor : iconBg }}
                            >
                              {isVideo ? (
                                isWatched ? (
                                  <CheckCircle2 className="h-4 w-4" style={{ color: "white" }} />
                                ) : (
                                  <Play className="h-4 w-4" style={{ color: iconColor }} />
                                )
                              ) : (
                                <Circle className="h-4 w-4" style={{ color: iconColor }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-900 truncate">{l.title}</p>
                              <p className="text-xs text-neutral-500 mt-0.5">
                                {l.day}
                                {isWatched ? " · Watched" : ""}
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
      </main>

      {activeLesson && (
        <div
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
              <Button variant="ghost" onClick={closeLesson} className="rounded-full">
                <X className="h-4 w-4 mr-1" />
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
                onClick={() => toggleWatched(activeLesson)}
                className="rounded-full text-white"
                style={{ backgroundColor: "#E05A2B" }}
              >
                {watched[activeLesson.id] ? "Mark as unwatched" : "Mark as watched"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
