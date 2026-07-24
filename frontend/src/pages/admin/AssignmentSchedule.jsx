import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarClock, List, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/assignment-schedule", label: "Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources", group: "Content" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules", group: "Content" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars", group: "Content" },
  { to: "/admin/results", label: "Results", testId: "nav-results", group: "Content" },
];

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Operation failed";

const emptyForm = { batch_id: "", assignment_name: "", visible_from: "", notes: "", host_name: "" };

// datetime-local input needs "YYYY-MM-DDTHH:mm"; Postgres gives back a full
// ISO string with timezone, so trim it down for the input, and expand it
// back out to a real ISO string before sending.
const toLocalInputValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function statusFor(schedule) {
  const now = new Date();
  const visibleFrom = new Date(schedule.visible_from);
  if (now < visibleFrom) return { label: "Scheduled", bg: "#FFF3E0", fg: "#B45309" };
  return { label: "Live", bg: "#E1F5EE", fg: "#085041" };
}

// "YYYY-MM-DD" in local time (not UTC) - used as the calendar cell key.
const ymd = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Builds a 6-week grid (42 cells) for the given month so every layout is
// the same height - includes trailing days from the previous/next month
// to fill the first and last week.
function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

export default function AssignmentSchedule() {
  const [schedules, setSchedules] = useState([]);
  const [batches, setBatches] = useState([]);
  const [assignmentNames, setAssignmentNames] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [view, setView] = useState("calendar"); // "calendar" | "list"
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const batchName = (id) => batches.find((b) => b.id === id)?.name || "Unknown batch";

  const load = async () => {
    setLoading(true);
    try {
      const [scheduleData, batchData, namesData] = await Promise.all([
        api.listAssignmentSchedules(),
        api.listBatches().catch(() => []),
        api.getAssignmentsList().catch(() => ({ assignments: [] })),
      ]);
      setSchedules(Array.isArray(scheduleData) ? scheduleData : []);
      setBatches(Array.isArray(batchData) ? batchData : []);
      setAssignmentNames(namesData?.assignments || []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => new Date(a.visible_from) - new Date(b.visible_from)),
    [schedules]
  );

  const monthGrid = useMemo(() => buildMonthGrid(month), [month]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const s of schedules) {
      const key = ymd(new Date(s.visible_from));
      (map[key] ||= []).push(s);
    }
    return map;
  }, [schedules]);

  // `presetDate` lets the calendar's "+" button pre-fill which day this
  // new schedule should appear on, defaulting to 9 AM that day.
  const openCreate = (presetDate) => {
    setEditing(null);
    if (presetDate) {
      const d = new Date(presetDate);
      d.setHours(9, 0, 0, 0);
      setForm({ ...emptyForm, visible_from: toLocalInputValue(d.toISOString()) });
    } else {
      setForm(emptyForm);
    }
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      batch_id: s.batch_id,
      assignment_name: s.assignment_name,
      visible_from: toLocalInputValue(s.visible_from),
      notes: s.notes || "",
      host_name: s.host_name || "",
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.batch_id) { toast.error("Pick a batch"); return; }
    if (!form.assignment_name) { toast.error("Pick an assignment"); return; }
    if (!form.visible_from) { toast.error("Set when it should appear"); return; }
    setSaving(true);
    try {
      const visibleFromIso = new Date(form.visible_from).toISOString();
      const payload = {
        batch_id: form.batch_id,
        assignment_name: form.assignment_name,
        visible_from: visibleFromIso,
        // The backend column is still required (not null) - since there's
        // no separate due date anymore, we just mirror the appears-on date
        // so nothing breaks without a schema change.
        due_date: visibleFromIso.slice(0, 10),
        notes: form.notes,
        host_name: form.host_name || null,
      };
      if (editing) {
        await api.updateAssignmentSchedule(editing.id, payload);
        toast.success("Schedule updated");
      } else {
        await api.createAssignmentSchedule(payload);
        toast.success("Assignment scheduled");
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
      await api.deleteAssignmentSchedule(confirmDelete.id);
      toast.success("Schedule removed");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Content</p>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Assignment Schedule</h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Pick a batch and an assignment, set when it appears.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-neutral-100 rounded-full p-1">
            <button
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                view === "calendar" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Calendar
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                view === "list" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <Button onClick={() => openCreate()} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Schedule assignment
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading...</p>
      ) : view === "list" ? (
        sorted.length === 0 ? (
          <Card className="rounded-2xl border-neutral-200/80 p-10 text-center">
            <CalendarClock className="h-6 w-6 mx-auto text-neutral-300 mb-2" />
            <p className="text-neutral-500 text-sm">Nothing scheduled yet.</p>
          </Card>
        ) : (
          <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
            <ul className="divide-y divide-neutral-100">
              {sorted.map((s) => {
                const status = statusFor(s);
                return (
                  <li key={s.id} className="px-5 py-4 flex items-center gap-3.5 group">
                    <div
                      className="h-9 w-9 rounded-full grid place-items-center flex-shrink-0"
                      style={{ backgroundColor: status.bg }}
                    >
                      <CalendarClock className="h-4 w-4" style={{ color: status.fg }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {s.assignment_name} <span className="text-neutral-400 font-normal">&middot; {batchName(s.batch_id)}</span>
                        {s.host_name && <span className="text-neutral-400 font-normal"> &middot; Host: {s.host_name}</span>}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Appears {new Date(s.visible_from).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status.bg, color: status.fg }}
                    >
                      {status.label}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)} className="rounded-full h-7 w-7">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => setConfirmDelete(s)}
                        className="rounded-full h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      ) : (
        <Card className="rounded-3xl border-neutral-200/80 p-7">
          <div className="flex items-center justify-between mb-6">
            <p className="text-2xl font-semibold tracking-tight text-neutral-900">
              {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="icon" variant="ghost"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="rounded-full h-10 w-10"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="rounded-full h-10 text-sm px-4"
              >
                Today
              </Button>
              <Button
                size="icon" variant="ghost"
                onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="rounded-full h-10 w-10"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-neutral-100 rounded-2xl overflow-hidden border border-neutral-100">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="bg-neutral-50 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500 py-3.5">
                {w}
              </div>
            ))}
            {monthGrid.map(({ date, inMonth }) => {
              const key = ymd(date);
              const dayEvents = eventsByDay[key] || [];
              const isToday = key === ymd(new Date());
              return (
                <div
                  key={key}
                  className={`bg-white min-h-[180px] p-3 group/cell relative ${inMonth ? "" : "bg-neutral-50/60"}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium ${
                        isToday ? "text-white shadow-md" : inMonth ? "text-neutral-700" : "text-neutral-300"
                      }`}
                      style={isToday ? { backgroundColor: "#E05A2B" } : {}}
                    >
                      {date.getDate()}
                    </span>
                    <button
                      onClick={() => openCreate(date)}
                      title="Schedule assignment on this day"
                      className="h-8 w-8 rounded-full grid place-items-center text-neutral-400 opacity-0 group-hover/cell:opacity-100 hover:bg-neutral-100 hover:text-neutral-700 transition-opacity flex-shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => openEdit(ev)}
                        title={`${ev.assignment_name} - ${batchName(ev.batch_id)}`}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all duration-150 border shadow-sm"
                        style={{ backgroundColor: "#FFF8ED", borderColor: "#FDE6C8", color: "#9A4000" }}
                      >
                        <p className="text-sm font-semibold leading-snug truncate">{ev.assignment_name}</p>
                        <p className="text-xs leading-snug truncate opacity-80 mt-0.5">{batchName(ev.batch_id)}</p>
                        {ev.host_name && (
                          <p className="text-xs leading-snug truncate opacity-90 font-medium mt-1.5 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400"></span> {ev.host_name}
                          </p>
                        )}
                        {ev.notes && (
                          <p className="text-xs leading-relaxed opacity-75 italic mt-1 line-clamp-2">{ev.notes}</p>
                        )}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-xs font-medium text-neutral-400 px-2 py-1 bg-neutral-100 rounded-md w-fit">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-90 data-[state=open]:slide-in-from-bottom-2">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "Schedule assignment"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this assignment's timing." : "Pick a batch and assignment, then set when it appears."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Batch</Label>
              <Select value={form.batch_id} onValueChange={(v) => setForm({ ...form, batch_id: v })}>
                <SelectTrigger className="h-10 rounded-xl mt-1">
                  <SelectValue placeholder="Select a batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Assignment</Label>
              <Select value={form.assignment_name} onValueChange={(v) => setForm({ ...form, assignment_name: v })}>
                <SelectTrigger className="h-10 rounded-xl mt-1">
                  <SelectValue placeholder="Select an assignment" />
                </SelectTrigger>
                <SelectContent>
                  {assignmentNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Appears on</Label>
              <Input
                type="datetime-local"
                value={form.visible_from}
                onChange={(e) => setForm({ ...form, visible_from: e.target.value })}
                className="h-10 rounded-xl mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Notes <span className="text-neutral-400">(optional)</span></Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="Anything trainees or staff should know"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Host Name <span className="text-neutral-400">(optional)</span></Label>
              <Input
                value={form.host_name}
                onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="Name of the host"
              />
            </div>
            <DialogFooter className={editing ? "sm:justify-between" : ""}>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setModalOpen(false);
                    setConfirmDelete(editing);
                  }}
                  className="rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 mr-auto"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">Cancel</Button>
                <Button type="submit" disabled={saving} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                  {saving ? "Saving..." : editing ? "Save changes" : "Schedule it"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.assignment_name} for {confirmDelete ? batchName(confirmDelete.batch_id) : ""} will no longer be scheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
