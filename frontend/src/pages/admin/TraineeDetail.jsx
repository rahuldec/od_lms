import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchSheetModules } from "@/lib/sheet";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Circle, Clock } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
];

const fmtMinutes = (sec) => {
  const m = Math.floor((sec || 0) / 60);
  const s = Math.floor((sec || 0) % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
};

export default function TraineeDetail() {
  const { id } = useParams();
  const [trainee, setTrainee] = useState(null);
  const [progress, setProgress] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

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
      } catch (e) {
        toast.error("Failed to load trainee");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const progressByLessonId = useMemo(() => {
    const m = {};
    progress.forEach((p) => (m[p.lesson_id] = p));
    return m;
  }, [progress]);

  const totalLessons = useMemo(
    () =>
      modules.reduce(
        (acc, m) => acc + m.lessons.filter((l) => l.kind === "video").length,
        0
      ),
    [modules]
  );
  const watchedCount = useMemo(
    () => progress.filter((p) => p.watched).length,
    [progress]
  );
  const totalSeconds = useMemo(
    () => progress.reduce((acc, p) => acc + (p.watch_seconds || 0), 0),
    [progress]
  );

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
        <Card className="lg:col-span-2 rounded-2xl border-neutral-200/80 p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                Trainee
              </p>
              <h1 className="text-3xl font-semibold mt-1 tracking-tight">
                {trainee.name}
              </h1>
              <p className="text-sm text-neutral-500 mt-2">
                @{trainee.username} · {trainee.phone || "no phone"}
              </p>
            </div>
            <Badge
              className="rounded-full"
              style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
            >
              Level {trainee.current_level ?? 0}
            </Badge>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Status
              </p>
              <p className="mt-1 font-medium">{trainee.status || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Manager
              </p>
              <p className="mt-1 font-medium">{trainee.manager || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Joined
              </p>
              <p className="mt-1 font-medium">{trainee.join_date || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Phone
              </p>
              <p className="mt-1 font-medium">{trainee.phone || "—"}</p>
            </div>
          </div>
          {trainee.notes && (
            <div className="mt-6 p-4 rounded-xl bg-neutral-50 text-sm text-neutral-700">
              {trainee.notes}
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border-neutral-200/80 p-7">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
            Progress
          </p>
          <p className="text-4xl font-semibold mt-2 tabular-nums">
            {watchedCount}
            <span className="text-neutral-300 text-2xl">/{totalLessons}</span>
          </p>
          <p className="text-sm text-neutral-500 mt-1">lessons watched</p>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${
                  totalLessons ? (watchedCount / totalLessons) * 100 : 0
                }%`,
                backgroundColor: "#E05A2B",
              }}
            />
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
            <Clock className="h-4 w-4 text-neutral-400" />
            Total watch time:{" "}
            <span className="font-medium">{fmtMinutes(totalSeconds)}</span>
          </div>
        </Card>
      </div>

      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <h2 className="text-xl font-semibold mb-1">Lesson activity</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Watched lessons and time spent per video.
        </p>
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
                    <li
                      key={l.id}
                      className="px-4 py-3 flex items-center gap-3 text-sm"
                    >
                      {watched ? (
                        <CheckCircle2
                          className="h-4 w-4 flex-shrink-0"
                          style={{ color: "#E05A2B" }}
                        />
                      ) : (
                        <Circle className="h-4 w-4 text-neutral-300 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{l.title}</p>
                        <p className="text-xs text-neutral-400">
                          {l.day} · {l.kind}
                        </p>
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
