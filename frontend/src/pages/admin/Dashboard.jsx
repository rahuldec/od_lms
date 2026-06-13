import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { fetchAllAssignmentResults } from "@/lib/assignments";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, testId }) => (
  <Card data-testid={testId} className="rounded-2xl border-neutral-200/80 p-6 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">{label}</p>
        <p className="text-4xl font-semibold mt-3 text-neutral-900 tabular-nums">{value}</p>
      </div>
      <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </Card>
);

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
];

const levelColors = ["#94a3b8", "#f97316", "#8b5cf6", "#16a34a"];

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

export default function AdminDashboard() {
  const [trainees, setTrainees] = useState([]);
  const [assignmentResults, setAssignmentResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedLevel, setExpandedLevel] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [data, aResults] = await Promise.all([
          api.listTrainees(),
          fetchAllAssignmentResults().catch(() => ({})),
        ]);
        setTrainees(Array.isArray(data) ? data : []);
        setAssignmentResults(aResults || {});
      } catch (e) {
        toast.error("Could not load trainees");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = trainees.length;
  const active = trainees.filter((t) => t.status === "Active").length;
  const onHold = trainees.filter((t) => t.status === "On Hold").length;

  const levelGroups = [0, 1, 2, 3].map((lvl) => ({
    level: lvl,
    trainees: trainees.filter((t) => (t.current_level ?? 0) === lvl),
  }));

  const now = new Date();
  const promotionsThisMonth = trainees.reduce((acc, t) => {
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

  const getAssignments = (name) => {
    if (!name) return [];
    return assignmentResults[name.trim().toLowerCase()] || [];
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Overview</p>
        <h1 className="text-4xl font-semibold mt-1 tracking-tight">Training operations</h1>
        <p className="text-neutral-500 mt-2 max-w-xl">
          A snapshot of where every trainee stands, who needs attention, and who is ready for the next level.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat testId="stat-total" icon={Users} label="Total trainees" value={loading ? "-" : total} />
        <Stat testId="stat-active" icon={CheckCircle2} label="Active" value={loading ? "-" : active} />
        <Stat testId="stat-onhold" icon={PauseCircle} label="On hold" value={loading ? "-" : onHold} />
        <Stat testId="stat-promotions" icon={TrendingUp} label="Promotions this month" value={loading ? "-" : promotionsThisMonth} />
      </div>

      <Card className="rounded-2xl border-neutral-200/80 p-7">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Level distribution</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Click a level to see trainees, assignment scores and promotion history.
            </p>
          </div>
          <span className="text-sm text-neutral-400">{total} total</span>
        </div>

        <div className="space-y-4">
          {levelGroups.map(({ level, trainees: lvlTrainees }) => {
            const pct = total ? Math.round((lvlTrainees.length / total) * 100) : 0;
            const isExpanded = expandedLevel === level;
            return (
              <div key={level} className="border border-neutral-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedLevel(isExpanded ? null : level)}
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
                  <div className="border-t border-neutral-100 divide-y divide-neutral-50">
                    {lvlTrainees.map((t) => {
                      const history = Array.isArray(t.history) ? t.history : [];
                      const promotions = history.filter((h) => h.type === "promotion");
                      const assignments = getAssignments(t.name);
                      const days = daysSince(t.join_date);
                      return (
                        <div key={t.id} className="px-5 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-8 w-8 rounded-full grid place-items-center text-white text-xs font-semibold flex-shrink-0"
                                style={{ backgroundColor: "#E05A2B" }}
                              >
                                {t.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <Link
                                    to={`/admin/trainees/${t.id}`}
                                    className="text-sm font-medium text-neutral-900 hover:underline"
                                  >
                                    {t.name}
                                  </Link>
                                  {days !== null && (
                                    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-200">
                                      Day {days}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-neutral-500">
                                  @{t.username}
                                  {t.manager ? ` - ${t.manager}` : ""}
                                  {t.join_date ? ` - Joined ${fmtDate(t.join_date)}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ${
                                  t.status === "Active"
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    : "bg-neutral-100 text-neutral-600 ring-neutral-200"
                                }`}
                              >
                                {t.status}
                              </span>
                              <Badge
                                className="rounded-full text-xs"
                                style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
                              >
                                L{t.current_level ?? 0}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-3 ml-11">
                            {assignments.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {assignments.map((a) => {
                                  const color = a.passed ? "#16a34a" : "#dc2626";
                                  return (
                                    <button
                                      key={a.id}
                                      onClick={() => setActiveAssignment(a)}
                                      className="inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ borderColor: color + "40", backgroundColor: color + "10" }}
                                    >
                                      <span className="font-medium text-neutral-700">{a.name}:</span>
                                      <span className="font-semibold" style={{ color: color }}>
                                        {a.score}/{a.total}
                                      </span>
                                      <span style={{ color: color }}>
                                        {a.passed ? "Pass" : "Fail"}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-400 mb-2">No assignments attempted</p>
                            )}

                            {promotions.length > 0 ? (
                              <div>
                                <p className="text-xs text-neutral-400 uppercase tracking-wider mb-1.5">
                                  Promotion history
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {promotions.map((h, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 text-xs bg-neutral-50 border border-neutral-200 rounded-full px-2.5 py-1"
                                    >
                                      <TrendingUp className="h-3 w-3 text-orange-500" />
                                      L{h.from} to L{h.to}
                                      <span className="text-neutral-400">- {fmtDate(h.at)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-400">No promotions yet</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
    </AppShell>
  );
}
