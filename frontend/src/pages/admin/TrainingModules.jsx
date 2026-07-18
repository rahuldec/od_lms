import React, { useEffect, useState } from "react";
import { fetchSheetModules } from "@/lib/sheet";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PlayCircle, FileText, BookOpen, X, Loader2, RefreshCw } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars" },
  { to: "/admin/results", label: "Results", testId: "nav-results" },
];

export default function TrainingModules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const mods = await fetchSheetModules();
      setModules(mods);
    } catch (e) {
      toast.error("Could not load training content from the sheet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openLesson = (lesson) => {
    if (lesson.kind === "assignment") {
      if (lesson.assignmentUrl) {
        window.open(lesson.assignmentUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.info("No assignment link for this lesson yet");
      }
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

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Admin</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Training Modules</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Live from your training sheet — every module, video and practice sheet.
          </p>
        </div>
        <Button onClick={load} variant="outline" className="rounded-full h-11 px-5">
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="min-h-[30vh] grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : modules.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-12 text-center">
          <BookOpen className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400 font-medium">No modules found in the training sheet</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {modules.map((m) => (
            <Card key={m.id} className="rounded-2xl border-neutral-200/80 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="h-7 w-7 rounded-lg grid place-items-center text-white text-xs font-bold"
                  style={{ backgroundColor: "#E05A2B" }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-base font-semibold">{m.name}</h2>
                <span className="text-xs text-neutral-400">
                  {m.lessons.length} {m.lessons.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="divide-y divide-neutral-100">
                {m.lessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    onClick={() => openLesson(lesson)}
                    className="w-full flex items-start gap-3 py-4 text-left group"
                  >
                    <div className="h-8 w-8 rounded-lg bg-neutral-100 grid place-items-center flex-shrink-0 mt-0.5">
                      {lesson.kind === "assignment" ? (
                        <FileText className="h-4 w-4 text-neutral-400" />
                      ) : (
                        <PlayCircle className="h-4 w-4 text-neutral-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {lesson.day && (
                        <span className="text-xs font-medium text-neutral-400 block mb-1">{lesson.day}</span>
                      )}
                      <p className="text-sm font-semibold text-neutral-900 group-hover:underline">
                        {lesson.title}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {lesson.kind === "assignment"
                          ? lesson.assignmentUrl ? "Open assignment" : "No assignment link yet"
                          : lesson.videoEmbedUrl ? "Watch video" : "No video link yet"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Video modal - same pattern as /learn */}
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
