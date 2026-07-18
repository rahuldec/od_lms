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
import { Plus, Pencil, Trash2, CalendarClock } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars" },
  { to: "/admin/assignment-schedule", label: "Assignment Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/results", label: "Results", testId: "nav-results" },
];

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Operation failed";

const emptyForm = { batch_id: "", assignment_name: "", visible_from: "", due_date: "", notes: "" };

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
  const dueDate = new Date(schedule.due_date);
  if (now < visibleFrom) return { label: "Scheduled", bg: "#FFF3E0", fg: "#B45309" };
  if (now > dueDate) return { label: "Past due", bg: "#FEE2E2", fg: "#B91C1C" };
  return { label: "Live", bg: "#E1F5EE", fg: "#085041" };
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      batch_id: s.batch_id,
      assignment_name: s.assignment_name,
      visible_from: toLocalInputValue(s.visible_from),
      due_date: (s.due_date || "").slice(0, 10),
      notes: s.notes || "",
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.batch_id) { toast.error("Pick a batch"); return; }
    if (!form.assignment_name) { toast.error("Pick an assignment"); return; }
    if (!form.visible_from) { toast.error("Set when it should appear"); return; }
    if (!form.due_date) { toast.error("Set a due date"); return; }
    setSaving(true);
    try {
      const payload = {
        batch_id: form.batch_id,
        assignment_name: form.assignment_name,
        visible_from: new Date(form.visible_from).toISOString(),
        due_date: form.due_date,
        notes: form.notes,
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
            Pick a batch and an assignment, set when it appears and when it's due.
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
          <Plus className="h-4 w-4 mr-1.5" /> Schedule assignment
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading...</p>
      ) : sorted.length === 0 ? (
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
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Appears {new Date(s.visible_from).toLocaleString()} &middot; Due {new Date(s.due_date).toLocaleDateString()}
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
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit schedule" : "Schedule assignment"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this assignment's timing." : "Pick a batch and assignment, then set the timing."}
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
            <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs text-neutral-600">Due date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="h-10 rounded-xl mt-1"
                />
              </div>
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">Cancel</Button>
              <Button type="submit" disabled={saving} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {saving ? "Saving..." : editing ? "Save changes" : "Schedule it"}
              </Button>
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
