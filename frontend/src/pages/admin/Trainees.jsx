import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ArrowUpRight,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Award,
} from "lucide-react";
import { daysAtLevel } from "@/lib/levelHistory";

const STATUSES = ["Active", "On Hold", "Exited"];
const DEPARTMENTS = ["CS", "QA", "Sales"];
// RM designation - independent of the Level 0-3 ladder (no day-tracking, no
// promotion history log). null means no designation yet.
const RM_STEPS = [null, "ARM", "RM"];
const rmBadge = (status) => {
  const map = {
    ARM: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    RM: "bg-yellow-50 text-yellow-800 ring-yellow-300",
  };
  return map[status] || "";
};

const statusBadge = (s) => {
  const map = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
    Exited: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  };
  return map[s] || "bg-neutral-100 text-neutral-600 ring-neutral-200";
};

const departmentBadge = (d) => {
  const map = {
    CS: "bg-blue-50 text-blue-700 ring-blue-200",
    QA: "bg-purple-50 text-purple-700 ring-purple-200",
    Sales: "bg-orange-50 text-orange-700 ring-orange-200",
  };
  return map[d] || "bg-neutral-100 text-neutral-400 ring-neutral-200";
};

const emptyForm = {
  name: "",
  phone: "",
  join_date: "",
  manager: "",
  status: "Active",
  department: "CS",
  notes: "",
  username: "",
  password: "",
  batch_id: "",
  level_since_date: "",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

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

const errMsg = (e) =>
  e?.response?.data?.detail || e?.message || "Operation failed";

export default function Trainees() {
  const [list, setList] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [promotingId, setPromotingId] = useState(null);
  const [demotingId, setDemotingId] = useState(null);
  const [levelDialog, setLevelDialog] = useState(null); // { trainee, action: "promote" | "demote", date }
  const [sortDaysL0, setSortDaysL0] = useState(null); // "asc" | "desc" | null
  const [rmDialog, setRmDialog] = useState(null); // { trainee, next }
  const [rmBusyId, setRmBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, batchData] = await Promise.all([
        api.listTrainees(),
        api.listBatches(),
      ]);
      setList(Array.isArray(data) ? data : []);
      setBatches(Array.isArray(batchData) ? batchData : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      if (deptFilter !== "all" && t.department !== deptFilter) return false;
      if (!q) return true;
      return (
        t.name?.toLowerCase().includes(q) ||
        t.username?.toLowerCase().includes(q) ||
        t.manager?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
      );
    });
  }, [list, search, deptFilter]);

  const rows = useMemo(() => {
    const withDays = filtered.map((t) => ({ ...t, daysAtL0: daysAtLevel(t, 0) }));
    if (!sortDaysL0) return withDays;
    return [...withDays].sort((a, b) =>
      sortDaysL0 === "desc" ? b.daysAtL0 - a.daysAtL0 : a.daysAtL0 - b.daysAtL0
    );
  }, [filtered, sortDaysL0]);

  const toggleSortDaysL0 = () => {
    setSortDaysL0((cur) => (cur === "desc" ? "asc" : cur === "asc" ? null : "desc"));
  };

  const getBatchName = (batch_id) => {
    const b = batches.find((b) => b.id === batch_id);
    return b ? b.name : "—";
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name || "",
      phone: t.phone || "",
      join_date: t.join_date || "",
      manager: t.manager || "",
      status: t.status || "Active",
      department: t.department || "CS",
      notes: t.notes || "",
      username: t.username || "",
      password: "",
      batch_id: t.batch_id || "",
      level_since_date: t.level_since_date || "",
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.name || !form.username) {
      toast.error("Name and username are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateTrainee(editing.id, {
          name: form.name,
          phone: form.phone,
          join_date: form.join_date || null,
          manager: form.manager,
          status: form.status,
          department: form.department,
          notes: form.notes,
          batch_id: form.batch_id || null,
          level_since_date: form.level_since_date || null,
        });
        toast.success("Trainee updated");
      } else {
        if (!form.password || form.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setSaving(false);
          return;
        }
        await api.createTrainee({
          name: form.name,
          phone: form.phone,
          join_date: form.join_date || null,
          manager: form.manager,
          status: form.status,
          department: form.department,
          notes: form.notes,
          username: form.username.trim().toLowerCase(),
          password: form.password,
          batch_id: form.batch_id || null,
        });
        toast.success("Trainee added");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteTrainee(confirmDelete.id);
      toast.success("Trainee removed");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // Promote covers three independent targets an admin can choose between:
  // the next Level (0-3), ARM, or RM. Which ones are actually pickable
  // depends on the trainee's current state (see disabled options below).
  const openPromote = (t) => {
    const canLevel = (t.current_level ?? 0) < 3;
    const canARM = (t.rm_status ?? null) === null;
    const canRM = t.rm_status !== "RM";
    if (!canLevel && !canARM && !canRM) {
      toast.info("Already at Level 3 and RM");
      return;
    }
    setLevelDialog({
      trainee: t,
      action: "promote",
      date: todayStr(),
      target: canLevel ? "level" : canARM ? "ARM" : "RM",
    });
  };

  const openDemote = (t) => {
    const next = (t.current_level ?? 0) - 1;
    if (next < 0) { toast.info("Already at Level 0"); return; }
    setLevelDialog({ trainee: t, action: "demote", date: todayStr(), target: "level" });
  };

  const confirmLevelChange = async () => {
    if (!levelDialog) return;
    const { trainee: t, action, date, target } = levelDialog;
    if (!date) { toast.error("Pick a date"); return; }
    const isPromote = action === "promote";

    if (isPromote && target !== "level") {
      setPromotingId(t.id);
      try {
        await api.updateTrainee(t.id, { rm_status: target, rm_since_date: date });
        toast.success(`${t.name} promoted to ${target}, effective ${date}`);
        setLevelDialog(null);
        await load();
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setPromotingId(null);
      }
      return;
    }

    const next = (t.current_level ?? 0) + (isPromote ? 1 : -1);
    isPromote ? setPromotingId(t.id) : setDemotingId(t.id);
    try {
      if (isPromote) {
        await api.promoteTrainee(t.id, date);
      } else {
        await api.demoteTrainee(t.id, date);
      }
      toast.success(`${t.name} ${isPromote ? "promoted" : "demoted"} to Level ${next}`);
      setLevelDialog(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPromotingId(null);
      setDemotingId(null);
    }
  };

  const openDemoteRM = (t) => {
    const idx = RM_STEPS.indexOf(t.rm_status ?? null);
    const next = RM_STEPS[idx - 1];
    if (next === undefined) { toast.info("No RM designation to remove"); return; }
    setRmDialog({ trainee: t, next });
  };

  const confirmRMChange = async () => {
    if (!rmDialog) return;
    const { trainee: t, next } = rmDialog;
    setRmBusyId(t.id);
    try {
      // Fully clearing the designation also clears its effective date;
      // stepping down from RM to ARM keeps whichever date is already there.
      const payload = next ? { rm_status: next } : { rm_status: "", rm_since_date: "" };
      await api.updateTrainee(t.id, payload);
      toast.success(`${t.name} is now ${next || "not designated"}`);
      setRmDialog(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setRmBusyId(null);
    }
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Roster</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Trainees</h1>
        </div>
        <Button
          data-testid="add-trainee-button"
          onClick={openCreate}
          className="rounded-full text-white h-11 px-5"
          style={{ backgroundColor: "#E05A2B" }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add trainee
        </Button>
      </div>

      <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-3">
          <Search className="h-4 w-4 text-neutral-400 flex-shrink-0" />
          <input
            data-testid="trainee-search"
            placeholder="Search by name, username, phone, manager"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent flex-1 outline-none text-sm placeholder:text-neutral-400"
          />
          <select
            data-testid="department-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-sm border border-neutral-200 rounded-full px-3 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200 flex-shrink-0"
          >
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Batch</th>
                <th className="px-5 py-3 font-medium">Manager</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Level</th>
                <th className="px-5 py-3 font-medium">
                  <button
                    data-testid="sort-days-l0"
                    onClick={toggleSortDaysL0}
                    className="inline-flex items-center gap-1 hover:text-neutral-800"
                    title="Sort by days spent at Level 0"
                  >
                    Days @ L0
                    {sortDaysL0 === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : sortDaysL0 === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-neutral-300" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-neutral-400">Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-neutral-400">
                    No trainees yet. Click "Add trainee" to get started.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                    <td className="px-5 py-4 font-medium text-neutral-900">
                      <Link
                        to={`/admin/trainees/${t.id}`}
                        className="hover:underline inline-flex items-center gap-1"
                      >
                        {t.name}
                        <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400" />
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-neutral-600">{t.username}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ${departmentBadge(t.department)}`}>
                        {t.department || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-600">
                      {t.batch_id ? (
                        <Link
                          to={`/admin/batches/${t.batch_id}`}
                          className="hover:underline text-orange-600"
                        >
                          {getBatchName(t.batch_id)}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-4 text-neutral-600">{t.manager || "—"}</td>
                    <td className="px-5 py-4 text-neutral-600">{t.join_date || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ${statusBadge(t.status)}`}>
                        {t.status || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        variant="secondary"
                        className="rounded-full font-medium"
                        style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}
                      >
                        L{t.current_level ?? 0}
                      </Badge>
                      {t.level_since_date && (
                        <div className="text-[11px] text-neutral-400 mt-1">
                          since {t.level_since_date}
                        </div>
                      )}
                      {t.rm_status && (
                        <>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ml-1.5 ${rmBadge(t.rm_status)}`}
                          >
                            {t.rm_status}
                          </span>
                          {t.rm_since_date && (
                            <div className="text-[11px] text-neutral-400 mt-1">
                              since {t.rm_since_date}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-4 text-neutral-600 tabular-nums" data-testid={`days-l0-${t.id}`}>
                      {t.daysAtL0}
                      <span className="text-neutral-400 ml-1">{t.daysAtL0 === 1 ? "day" : "days"}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          data-testid={`promote-${t.id}`}
                          size="sm"
                          variant="outline"
                          disabled={((t.current_level ?? 0) >= 3 && t.rm_status === "RM") || promotingId === t.id}
                          onClick={() => openPromote(t)}
                          className="rounded-full"
                          title="Promote to the next Level, ARM, or RM"
                        >
                          <TrendingUp className="h-3.5 w-3.5 mr-1" />
                          Promote
                        </Button>
                        <Button
                          data-testid={`demote-${t.id}`}
                          size="sm"
                          variant="outline"
                          disabled={(t.current_level ?? 0) <= 0 || demotingId === t.id}
                          onClick={() => openDemote(t)}
                          className="rounded-full"
                        >
                          <TrendingDown className="h-3.5 w-3.5 mr-1" />
                          Demote
                        </Button>
                        {t.rm_status && (
                          <Button
                            data-testid={`demote-rm-${t.id}`}
                            size="sm"
                            variant="ghost"
                            disabled={rmBusyId === t.id}
                            onClick={() => openDemoteRM(t)}
                            className="rounded-full text-neutral-500"
                            title="Remove RM designation"
                          >
                            Remove {t.rm_status}
                          </Button>
                        )}
                        <Button
                          data-testid={`edit-${t.id}`}
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(t)}
                          className="rounded-full"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          data-testid={`delete-${t.id}`}
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDelete(t)}
                          className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent data-testid="trainee-dialog" className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit trainee" : "Add a new trainee"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update trainee details. Username cannot be changed." : "Create a new trainee account with login credentials."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-neutral-600">Full name</Label>
                <Input
                  data-testid="form-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-neutral-600">Phone</Label>
                <Input
                  data-testid="form-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-neutral-600">Join date</Label>
                <Input
                  data-testid="form-joindate"
                  type="date"
                  value={form.join_date}
                  onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-neutral-600">Manager</Label>
                <Input
                  data-testid="form-manager"
                  value={form.manager}
                  onChange={(e) => setForm({ ...form, manager: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
              {editing && (
                <div>
                  <Label className="text-xs text-neutral-600">Level since date</Label>
                  <Input
                    data-testid="form-levelsince"
                    type="date"
                    value={form.level_since_date}
                    onChange={(e) => setForm({ ...form, level_since_date: e.target.value })}
                    className="h-10 rounded-xl mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-neutral-600">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="form-status" className="h-10 rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-neutral-600">Department</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                  <SelectTrigger data-testid="form-department" className="h-10 rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-neutral-600">Username</Label>
                <Input
                  data-testid="form-username"
                  value={form.username}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
              {!editing && (
                <div>
                  <Label className="text-xs text-neutral-600">Password</Label>
                  <Input
                    data-testid="form-password"
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="h-10 rounded-xl mt-1"
                  />
                </div>
              )}
              <div className="col-span-2">
                <Label className="text-xs text-neutral-600">Batch</Label>
                <Select
                  value={form.batch_id || "none"}
                  onValueChange={(v) => setForm({ ...form, batch_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="h-10 rounded-xl mt-1">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No batch —</SelectItem>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-neutral-600">Notes</Label>
                <Textarea
                  data-testid="form-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-xl mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button
                data-testid="save-trainee"
                type="submit"
                disabled={saving}
                className="rounded-full text-white"
                style={{ backgroundColor: "#E05A2B" }}
              >
                {saving ? "Saving..." : editing ? "Save changes" : "Create trainee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trainee, their login and their lesson progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete"
              onClick={doDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!levelDialog} onOpenChange={(o) => !o && setLevelDialog(null)}>
        <DialogContent data-testid="level-change-dialog" className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {levelDialog?.action === "promote" ? "Promote" : "Demote"} {levelDialog?.trainee?.name}
            </DialogTitle>
            <DialogDescription>
              {levelDialog && (
                levelDialog.action === "promote" ? (
                  levelDialog.target === "level" ? (
                    <>Moving from Level {levelDialog.trainee.current_level ?? 0} to Level{" "}
                    {(levelDialog.trainee.current_level ?? 0) + 1}. Choose the effective date.</>
                  ) : (
                    <>Setting {levelDialog.trainee.name} as {levelDialog.target}. Choose the effective date.</>
                  )
                ) : (
                  <>Moving from Level {levelDialog.trainee.current_level ?? 0} to Level{" "}
                  {(levelDialog.trainee.current_level ?? 0) - 1}. Choose the effective date.</>
                )
              )}
            </DialogDescription>
          </DialogHeader>

          {levelDialog?.action === "promote" && (
            <div>
              <Label className="text-xs text-neutral-600">Promote to</Label>
              <div className="flex gap-2 mt-1">
                {[
                  {
                    key: "level",
                    label: `Level ${(levelDialog.trainee.current_level ?? 0) + 1}`,
                    disabled: (levelDialog.trainee.current_level ?? 0) >= 3,
                  },
                  { key: "ARM", label: "ARM", disabled: (levelDialog.trainee.rm_status ?? null) !== null },
                  { key: "RM", label: "RM", disabled: levelDialog.trainee.rm_status === "RM" },
                ].map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    size="sm"
                    variant={levelDialog.target === opt.key ? "default" : "outline"}
                    disabled={opt.disabled}
                    onClick={() => setLevelDialog((d) => ({ ...d, target: opt.key }))}
                    className="rounded-full"
                    style={levelDialog.target === opt.key ? { backgroundColor: "#E05A2B", color: "white" } : undefined}
                  >
                    {opt.key !== "level" && <Award className="h-3.5 w-3.5 mr-1" />}
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs text-neutral-600">Effective date</Label>
            <Input
              data-testid="level-change-date"
              type="date"
              value={levelDialog?.date || ""}
              onChange={(e) => setLevelDialog((d) => ({ ...d, date: e.target.value }))}
              className="h-10 rounded-xl mt-1"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLevelDialog(null)} className="rounded-full">
              Cancel
            </Button>
            <Button
              data-testid="confirm-level-change"
              onClick={confirmLevelChange}
              disabled={promotingId === levelDialog?.trainee?.id || demotingId === levelDialog?.trainee?.id}
              className="rounded-full text-white"
              style={{ backgroundColor: "#E05A2B" }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!rmDialog} onOpenChange={(o) => !o && setRmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rmDialog?.next ? `Set ${rmDialog.trainee.name} as ${rmDialog.next}?` : `Remove ${rmDialog?.trainee?.name}'s RM designation?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is independent of their Level - it won't affect Level 0-3 progress or history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-rm-change"
              onClick={confirmRMChange}
              disabled={rmBusyId === rmDialog?.trainee?.id}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
