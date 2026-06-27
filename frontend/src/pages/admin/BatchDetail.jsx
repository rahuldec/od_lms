import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchSheetModules } from "@/lib/sheet";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Clock, TrendingUp, Layers, Flag } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
];

const fmtMinutes = (sec) => {
  const m = Math.floor((sec || 0) / 60);
  const s = Math.floor((sec || 0) % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
};

const statusBadge = (s) => {
  const map = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Completed: "bg-blue-50 text-blue-700 ring-blue-200",
    "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return map[s] || "bg-neutral-100 text-neutral-600 ring-neutral-200";
};

export default function BatchDetail() {
  const { id } = useParams();
  const [batch, setBatch] = useState(null);
  const [trainees, setTrainees] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState(null);

  // Module assignment state
  const [assignedModules, setAssignedModules] = useState(new Set());
  const [savingModule, setSavingModule] = useState(null); // module name currently being toggled
  const [currentModule, setCurrentModule] = useState(""); // module the batch is currently on
  const [savingCurrent, setSavingCurrent] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [bRes, mods, batchModulesRes] = await Promise.all([
          api.getBatch(id),
          fetchSheetModules().catch(() => []),
          api.getBatchModules(id).catch(() => []),
        ]);
        setBatch(bRes.batch || null);
        setCurrentModule(bRes.batch?.current_module || "");
        setTrainees(bRes.trainees || []);
        setModules(mods || []);
        setAssignedModules(
          new Set((batchModulesRes || []).map((row) => row.module_name))
        );

        // fetch progress for each trainee
        const pm = {};
        await Promise.all(
          (bRes.trainees || []).map(async (t) => {
            try {
              const res = await api.getTrainee(t.id);
              pm[t.id] = res.progress || [];
            } catch {
              pm[t.id] = [];
            }
          })
        );
        setProgressMap(pm);
      } catch (e) {
        toast.error("Failed to load batch");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totalLessons = useMemo(
    () =>
      modules.reduce(
        (acc, m) => acc + m.lessons.filter((l) => l.kind === "video").length,
        0
      ),
    [modules]
  );

  // For each module, how many trainees in this batch have watched every
  // video lesson in it. Keyed by module name -> { completed, total }.
  const moduleCompletion = useMemo(() => {
    const map = {};
    modules.forEach((m) => {
      const videoLessonIds = m.lessons.filter((l) => l.kind === "video").map((l) => l.id);
      const completed = trainees.filter((t) => {
        const watchedIds = new Set(
          (progressMap[t.id] || []).filter((p) => p.watched).map((p) => p.lesson_id)
        );
        return videoLessonIds.length > 0 && videoLessonIds.every((lid) => watchedIds.has(lid));
      }).length;
      map[m.name] = { completed, total: trainees.length };
    });
    return map;
  }, [modules, trainees, progressMap]);

  const toggleModule = async (moduleName) => {
    const next = new Set(assignedModules);
    if (next.has(moduleName)) {
      next.delete(moduleName);
    } else {
      next.add(moduleName);
    }
    setSavingModule(moduleName);
    try {
      await api.setBatchModules(id, Array.from(next));
      setAssignedModules(next);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update module assignment");
    } finally {
      setSavingModule(null);
    }
  };

  const setAsCurrent = async (moduleName) => {
    const turningOff = currentModule === moduleName;
    const nextCurrent = turningOff ? "" : moduleName;
    setSavingCurrent(moduleName);
    try {
      // The current module should also be visible to trainees.
      if (!turningOff && !assignedModules.has(moduleName)) {
        const nextAssigned = new Set(assignedModules);
        nextAssigned.add(moduleName);
        await api.setBatchModules(id, Array.from(nextAssigned));
        setAssignedModules(nextAssigned);
      }
      await api.updateBatch(id, { current_module: nextCurrent || "" });
      setCurrentModule(nextCurrent);
      toast.success(
        turningOff ? `Cleared current module` : `${moduleName} set as current module`
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update current module");
    } finally {
      setSavingCurrent(null);
    }
  };

  const promote = async (t) => {
    const next = (t.current_level ?? 0) + 1;
    if (next > 3) { toast.info("Already at Level 3"); return; }
    setPromotingId(t.id);
    try {
      await api.promoteTrainee(t.id);
      toast.success(`${t.name} promoted to Level ${next}`);
      const bRes = await api.getBatch(id);
      setTrainees(bRes.trainees || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to promote");
    } finally {
      setPromotingId(null);
    }
  };

  if (loading) {
    return (
      <AppShell navItems={navItems} subtitle="Admin">
        <p className="text-neutral-400">Loading…</p>
      </AppShell>
    );
  }

  if (!batch) {
    return (
      <AppShell navItems={navItems} subtitle="Admin">
        <p className="text-neutral-500">Batch not found.</p>
      </AppShell>
    );
  }

  const totalWatched = Object.values(progressMap).reduce(
    (acc, prog) => acc + prog.filter((p) => p.watched).length,
    0
  );
  const totalPossible = totalLessons * trainees.length;
  const batchPct = totalPossible ? Math.round((totalWatched / totalPossible) * 100) : 0;

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <Link
        to="/admin/batches"
        className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to batches
      </Link>

      {/* Batch Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2 rounded-2xl border-neutral-200/80 p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Batch</p>
              <h1 className="text-3xl font-semibold mt-1 tracking-tight">{batch.name}</h1>
              {batch.start_date && (
                <p className="text-sm text-neutral-500 mt-1">Started: {batch.start_date}</p>
              )}
              <p className="text-sm mt-2 flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5" style={{ color: currentModule ? "#E05A2B" : "#a3a3a3" }} />
                {currentModule ? (
                  <span className="text-neutral-700">
                    Currently on <span className="font-medium">{currentModule}</span>
                  </span>
                ) : (
                  <span className="text-neutral-400">No current module set</span>
                )}
              </p>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ${statusBadge(batch.status)}`}>
              {batch.status}
            </span>
          </div>
          {batch.notes && (
            <div className="mt-6 p-4 rounded-xl bg-neutral-50 text-sm text-neutral-700">
              {batch.notes}
            </div>
          )}
        </Card>

        {/* Batch Progress */}
        <Card className="rounded-2xl border-neutral-200/80 p-7">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Batch Progress</p>
          <p className="text-4xl font-semibold mt-2 tabular-nums">
            {batchPct}<span className="text-neutral-300 text-2xl">%</span>
          </p>
          <p className="text-sm text-neutral-500 mt-1">{trainees.length} trainees</p>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-5">
            <div
              className="h-full rounded-full"
              style={{ width: `${batchPct}%`, backgroundColor: "#E05A2B" }}
            />
          </div>
          <div className="mt-4 text-sm text-neutral-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-neutral-400" />
            {totalWatched} / {totalPossible} lessons watched
          </div>
        </Card>
      </div>

      {/* Module Assignment */}
      <Card className="rounded-2xl border-neutral-200/80 p-7 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-neutral-400" />
          <h2 className="text-lg font-semibold">Modules assigned to this batch</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-5">
          Only checked modules will be visible to trainees in this batch. Use the flag to mark which module the batch is currently on.
        </p>
        {modules.length === 0 ? (
          <p className="text-sm text-neutral-400">No modules found in the training sheet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => {
              const checked = assignedModules.has(m.name);
              const isSaving = savingModule === m.name;
              const isCurrent = currentModule === m.name;
              const isSavingCurrent = savingCurrent === m.name;
              const completion = moduleCompletion[m.name] || { completed: 0, total: trainees.length };
              return (
                <div
                  key={m.name}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-colors ${
                    isCurrent
                      ? "border-[#E05A2B] bg-[#FFF0E8] ring-1 ring-[#E05A2B]/40"
                      : checked
                      ? "border-[#E05A2B]/30 bg-[#FFF0E8]"
                      : "border-neutral-200 hover:bg-neutral-50"
                  } ${isSaving ? "opacity-60 pointer-events-none" : ""}`}
                >
                  <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModule(m.name)}
                      className="h-4 w-4 rounded border-neutral-300 accent-[#E05A2B]"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-neutral-800 block truncate">{m.name}</span>
                      <span className="text-xs text-neutral-500">
                        {completion.completed}/{completion.total} trainees completed
                      </span>
                    </div>
                  </label>
                  <button
                    type="button"
                    title={isCurrent ? "Clear current module" : "Mark as current module"}
                    onClick={() => setAsCurrent(m.name)}
                    disabled={isSavingCurrent}
                    className={`shrink-0 h-7 w-7 rounded-full grid place-items-center transition-colors ${
                      isCurrent
                        ? "bg-[#E05A2B] text-white"
                        : "text-neutral-300 hover:text-[#E05A2B] hover:bg-white"
                    } ${isSavingCurrent ? "opacity-60" : ""}`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Trainees Table */}
      <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100">
          <h2 className="text-lg font-semibold">Trainees in this batch</h2>
        </div>
        {trainees.length === 0 ? (
          <div className="px-6 py-12 text-center text-neutral-400">
            No trainees assigned to this batch yet.
            <br />
            <span className="text-sm">Go to Trainees page to assign trainees to this batch.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium">Level</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                  <th className="px-5 py-3 font-medium">Watch Time</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trainees.map((t) => {
                  const prog = progressMap[t.id] || [];
                  const watched = prog.filter((p) => p.watched).length;
                  const seconds = prog.reduce((acc, p) => acc + (p.watch_seconds || 0), 0);
                  const pct = totalLessons ? Math.round((watched / totalLessons) * 100) : 0;
                  return (
                    <tr key={t.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                      <td className="px-5 py-4 font-medium">
                        <Link
                          to={`/admin/trainees/${t.id}`}
                          className="hover:underline inline-flex items-center gap-1"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-neutral-600">{t.username}</td>
                      <td className="px-5 py-4">
                        <Badge
                          variant="secondary"
                          className="rounded-full font-medium"
                          style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
                        >
                          L{t.current_level ?? 0}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: "#E05A2B" }}
                            />
                          </div>
                          <span className="text-xs text-neutral-500">{watched}/{totalLessons}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-neutral-600">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          {fmtMinutes(seconds)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ${
                          t.status === "Active"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-neutral-100 text-neutral-600 ring-neutral-200"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(t.current_level ?? 0) >= 3 || promotingId === t.id}
                          onClick={() => promote(t)}
                          className="rounded-full"
                        >
                          <TrendingUp className="h-3.5 w-3.5 mr-1" />
                          Promote
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
