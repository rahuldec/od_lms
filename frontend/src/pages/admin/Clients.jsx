import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  fetchClients,
  clientFacets,
  groupAssignmentsByClient,
  groupAssignmentsByTrainee,
} from "@/lib/clients";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Briefcase,
  UserCheck,
  UserX,
  Users,
  RefreshCw,
  AlertTriangle,
  Check,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees", group: "Roster" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches", group: "Roster" },
  { to: "/admin/assignment-schedule", label: "Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/analytics", label: "Analytics", testId: "nav-analytics" },
  { to: "/admin/clients", label: "Clients", testId: "nav-clients", group: "Content" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources", group: "Content" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules", group: "Content" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars", group: "Content" },
  { to: "/admin/results", label: "Results", testId: "nav-results", group: "Content" },
];

const Stat = ({ icon: Icon, label, value }) => (
  <Card className="rounded-2xl border-neutral-200/80 p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">{label}</p>
        <p className="text-3xl font-semibold mt-2 text-neutral-900 tabular-nums">{value}</p>
      </div>
      <div
        className="h-8 w-8 rounded-lg grid place-items-center"
        style={{ backgroundColor: "#FFF0E8", color: ORANGE }}
      >
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </Card>
);

/** Per-row trainee picker. Saves the client's full trainee set in one call. */
function RowPicker({ client, trainees, assignedIds, onSaved }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = async (nextIds) => {
    setSaving(true);
    try {
      await api.setClientTrainees(client.name, nextIds);
      onSaved(client.name, nextIds);
    } catch {
      toast.error(`Could not update ${client.name}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id) =>
    commit(
      assignedIds.includes(id)
        ? assignedIds.filter((x) => x !== id)
        : [...assignedIds, id]
    );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-full px-2.5 py-1 hover:bg-neutral-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
        Edit
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
          {trainees.length === 0 ? (
            <p className="text-xs text-neutral-400 px-3 py-2">No active trainees.</p>
          ) : (
            trainees.map((t) => {
              const on = assignedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-50 text-left"
                >
                  <span
                    className="h-3.5 w-3.5 rounded border grid place-items-center flex-shrink-0"
                    style={
                      on
                        ? { backgroundColor: ORANGE, borderColor: ORANGE }
                        : { borderColor: "#d4d4d4" }
                    }
                  >
                    {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm text-neutral-700 truncate">{t.name}</span>
                  <span className="ml-auto text-[10px] text-neutral-400">
                    L{t.current_level ?? 0}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetError, setSheetError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ segment: "", category: "", owner: "" });
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [checked, setChecked] = useState(() => new Set());
  const [bulkTrainee, setBulkTrainee] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async ({ force = false } = {}) => {
    const [clientRes, traineeRes, assignRes] = await Promise.allSettled([
      fetchClients({ force }),
      api.listTrainees(),
      api.listClientAssignments(),
    ]);
    if (clientRes.status === "fulfilled") {
      setClients(clientRes.value);
      setSheetError(null);
    } else {
      setSheetError(clientRes.reason?.message || "Could not read the client sheet");
    }
    if (traineeRes.status === "fulfilled")
      setTrainees((traineeRes.value || []).filter((t) => t.status !== "Exited"));
    if (assignRes.status === "fulfilled") setAssignments(assignRes.value || []);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
    toast.success("Client list refreshed from the sheet");
  };

  const traineeById = useMemo(
    () => Object.fromEntries(trainees.map((t) => [t.id, t])),
    [trainees]
  );
  const byClient = useMemo(() => groupAssignmentsByClient(assignments), [assignments]);
  const byTrainee = useMemo(() => groupAssignmentsByTrainee(assignments), [assignments]);
  const facets = useMemo(() => clientFacets(clients), [clients]);

  // Assignments whose client_name no longer matches anything in the sheet -
  // almost always a rename upstream. Surfaced rather than silently ignored,
  // since the trainee still believes they own it.
  const orphans = useMemo(() => {
    const known = new Set(clients.map((c) => c.id));
    const out = {};
    assignments.forEach((a) => {
      const key = a.client_name.trim().toLowerCase();
      if (known.has(key)) return;
      if (!out[a.client_name]) out[a.client_name] = [];
      const t = traineeById[a.trainee_id];
      if (t) out[a.client_name].push(t.name);
    });
    return out;
  }, [assignments, clients, traineeById]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      const owners = byClient[c.id] || [];
      if (assignedFilter === "assigned" && owners.length === 0) return false;
      if (assignedFilter === "unassigned" && owners.length > 0) return false;
      if (q) {
        const ownerNames = owners.map((o) => traineeById[o.trainee_id]?.name || "").join(" ");
        const hay = `${c.name} ${c.owner} ${ownerNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return ["segment", "category", "owner"].every(
        (k) => !filters[k] || c[k] === filters[k]
      );
    });
  }, [clients, query, filters, assignedFilter, byClient, traineeById]);

  const assignedCount = useMemo(
    () => clients.filter((c) => (byClient[c.id] || []).length > 0).length,
    [clients, byClient]
  );

  // Local state update after a save, so the table reflects the change without
  // re-fetching every assignment row.
  const applyLocal = (clientName, traineeIds) => {
    setAssignments((prev) => [
      ...prev.filter((a) => a.client_name.trim().toLowerCase() !== clientName.trim().toLowerCase()),
      ...traineeIds.map((tid) => ({
        id: `${tid}-${clientName}`,
        trainee_id: tid,
        client_name: clientName,
      })),
    ]);
  };

  const toggleCheck = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allVisibleChecked = visible.length > 0 && visible.every((c) => checked.has(c.id));

  const runBulk = async (mode) => {
    const targets = visible.filter((c) => checked.has(c.id));
    if (targets.length === 0) return;
    if (mode !== "clear" && !bulkTrainee) {
      toast.error("Pick a trainee first");
      return;
    }
    setBulkBusy(true);
    let failed = 0;
    for (const c of targets) {
      const current = byClient[c.id] || [];
      let next;
      if (mode === "add") next = current.includes(bulkTrainee) ? current : [...current, bulkTrainee];
      else if (mode === "move") next = [bulkTrainee];
      else next = [];
      try {
        await api.setClientTrainees(c.name, next);
        applyLocal(c.name, next);
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setChecked(new Set());
    if (failed) toast.error(`${failed} of ${targets.length} could not be updated`);
    else toast.success(`${targets.length} client${targets.length === 1 ? "" : "s"} updated`);
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Client book</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Client assignment</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Who owns what. The client list is read live from the CS Team Plan sheet — only
            the trainee mapping is stored here.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-sm inline-flex items-center gap-2 border border-neutral-200 rounded-full px-4 py-2 hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh from sheet
        </button>
      </div>

      {sheetError && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50/60 p-5 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">Could not read the client sheet</p>
              <p className="text-amber-800">{sheetError}</p>
              <p className="text-amber-800 mt-2">
                Check that the CS Team Plan workbook is still published (File → Share →
                Publish to web → Clients → CSV) and that the link points at the Clients tab.
                Re-publishing mints a new link, so if the sheet was republished, update{" "}
                <code className="bg-amber-100 px-1 rounded">REACT_APP_CLIENTS_CSV_URL</code>.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon={Briefcase} label="Clients" value={loading ? "-" : clients.length} />
        <Stat icon={UserCheck} label="Assigned" value={loading ? "-" : assignedCount} />
        <Stat
          icon={UserX}
          label="Unassigned"
          value={loading ? "-" : clients.length - assignedCount}
        />
        <Stat
          icon={Users}
          label="Trainees with a book"
          value={loading ? "-" : Object.keys(byTrainee).length}
        />
      </div>

      {Object.keys(orphans).length > 0 && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50/60 p-5 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">
                {Object.keys(orphans).length} assigned client
                {Object.keys(orphans).length === 1 ? "" : "s"} no longer in the sheet
              </p>
              <p className="text-amber-800">
                Probably renamed upstream. Reassign under the new name, or clear them.
              </p>
              <ul className="mt-2 space-y-0.5">
                {Object.entries(orphans).map(([name, who]) => (
                  <li key={name} className="text-amber-800">
                    <span className="font-medium">{name}</span> — {who.join(", ") || "unknown"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Per-trainee summary, so the split is visible without scanning the table */}
      <Card className="rounded-2xl border-neutral-200/80 p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Book size per trainee</h2>
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : trainees.length === 0 ? (
          <p className="text-sm text-neutral-400">No active trainees.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...trainees]
              .sort((a, b) => (byTrainee[b.id]?.length || 0) - (byTrainee[a.id]?.length || 0))
              .map((t) => {
                const n = byTrainee[t.id]?.length || 0;
                return (
                  <Link
                    key={t.id}
                    to={`/admin/trainees/${t.id}`}
                    className="inline-flex items-center gap-2 border border-neutral-200 rounded-full pl-1.5 pr-3 py-1 hover:bg-neutral-50 transition-colors"
                  >
                    <span
                      className="h-6 w-6 rounded-full grid place-items-center text-white text-[10px] font-semibold"
                      style={{ backgroundColor: n > 0 ? ORANGE : "#cbd5e1" }}
                    >
                      {n}
                    </span>
                    <span className="text-sm text-neutral-700">{t.name}</span>
                  </Link>
                );
              })}
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border-neutral-200/80 overflow-visible">
        <div className="p-5 border-b border-neutral-100 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client, RM or trainee…"
              className="w-full text-sm border border-neutral-200 rounded-full pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          {[
            { key: "segment", label: "All segments" },
            { key: "category", label: "All sizes" },
            { key: "owner", label: "All RMs" },
          ].map(({ key, label }) => (
            <select
              key={key}
              value={filters[key]}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              className="text-sm border border-neutral-200 rounded-full px-3 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <option value="">{label}</option>
              {(facets[key] || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="text-sm border border-neutral-200 rounded-full px-3 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {checked.size > 0 && (
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">
              {checked.size} selected
            </span>
            <select
              value={bulkTrainee}
              onChange={(e) => setBulkTrainee(e.target.value)}
              className="text-sm border border-neutral-200 rounded-full px-3 py-1.5 bg-white"
            >
              <option value="">Choose trainee…</option>
              {trainees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => runBulk("add")}
              disabled={bulkBusy}
              className="text-sm px-4 py-1.5 rounded-full text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: ORANGE }}
            >
              Add
            </button>
            <button
              onClick={() => runBulk("move")}
              disabled={bulkBusy}
              className="text-sm px-4 py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50"
            >
              Move here
            </button>
            <button
              onClick={() => runBulk("clear")}
              disabled={bulkBusy}
              className="text-sm px-4 py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-red-600 disabled:opacity-50"
            >
              Unassign
            </button>
            {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                <th className="py-2.5 pl-5 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={() =>
                      setChecked(
                        allVisibleChecked ? new Set() : new Set(visible.map((c) => c.id))
                      )
                    }
                    className="accent-[#E05A2B]"
                  />
                </th>
                <th className="py-2.5 pr-4 font-medium">Client</th>
                <th className="py-2.5 pr-4 font-medium">Segment</th>
                <th className="py-2.5 pr-4 font-medium">RM</th>
                <th className="py-2.5 pr-4 font-medium">Assigned to</th>
                <th className="py-2.5 pr-5 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">
                    No clients match those filters.
                  </td>
                </tr>
              ) : (
                visible.map((c) => {
                  const owners = byClient[c.id] || [];
                  return (
                    <tr key={c.id} className="hover:bg-neutral-50/60">
                      <td className="py-2.5 pl-5 pr-2">
                        <input
                          type="checkbox"
                          checked={checked.has(c.id)}
                          onChange={() => toggleCheck(c.id)}
                          className="accent-[#E05A2B]"
                        />
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-neutral-800">
                        {c.name}
                        {c.isNew && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-600">
                            new
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-500">
                        {[c.segment, c.category].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-neutral-500">{c.owner || "—"}</td>
                      <td className="py-2.5 pr-4">
                        {owners.length === 0 ? (
                          <span className="text-neutral-300">Unassigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {owners.map((o) => (
                              <Badge
                                key={o.trainee_id}
                                variant="secondary"
                                className="rounded-full font-medium text-[11px] gap-1"
                                style={{ backgroundColor: "#FFF0E8", color: ORANGE }}
                              >
                                {traineeById[o.trainee_id]?.name || "Unknown"}
                                <span className="opacity-60 text-[9px] uppercase">
                                  {o.handling_mode === "assisted" ? "assisted" : "solo"}
                                </span>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-5 text-right">
                        <div className="inline-flex justify-end">
                          <RowPicker
                            client={c}
                            trainees={trainees}
                            assignedIds={owners.map((o) => o.trainee_id)}
                            onSaved={applyLocal}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && visible.length > 0 && (
          <div className="px-5 py-3 border-t border-neutral-100 text-xs text-neutral-400">
            Showing {visible.length} of {clients.length} clients
          </div>
        )}
      </Card>
    </AppShell>
  );
}
