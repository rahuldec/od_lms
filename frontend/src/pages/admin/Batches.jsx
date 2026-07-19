import React, { useEffect, useState } from "react";
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
import { Plus, Pencil, Trash2, ArrowUpRight, Users } from "lucide-react";

const STATUSES = ["Active", "Completed", "On Hold"];

const statusBadge = (s) => {
  const map = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Completed: "bg-blue-50 text-blue-700 ring-blue-200",
    "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return map[s] || "bg-neutral-100 text-neutral-600 ring-neutral-200";
};

const emptyForm = {
  name: "",
  start_date: "",
  status: "Active",
  notes: "",
};

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

export default function Batches() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listBatches();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name || "",
      start_date: b.start_date || "",
      status: b.status || "Active",
      notes: b.notes || "",
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.name) {
      toast.error("Batch name required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateBatch(editing.id, {
          name: form.name,
          start_date: form.start_date || null,
          status: form.status,
          notes: form.notes,
        });
        toast.success("Batch updated");
      } else {
        await api.createBatch({
          name: form.name,
          start_date: form.start_date || null,
          status: form.status,
          notes: form.notes,
        });
        toast.success("Batch created");
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
      await api.deleteBatch(confirmDelete.id);
      toast.success("Batch deleted");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
            Management
          </p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Batches</h1>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-full text-white h-11 px-5"
          style={{ backgroundColor: "#E05A2B" }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> New batch
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : list.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-12 text-center">
          <p className="text-neutral-400">No batches yet. Create your first batch!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((b) => (
            <Card key={b.id} className="rounded-2xl border-neutral-200/80 p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold truncate">{b.name}</h2>
                  {b.start_date && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Started: {b.start_date}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 ml-2 ${statusBadge(b.status)}`}>
                  {b.status}
                </span>
              </div>
              {b.notes && (
                <p className="text-sm text-neutral-500 line-clamp-2">{b.notes}</p>
              )}
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-neutral-100">
                <Link
                  to={`/admin/batches/${b.id}`}
                  className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
                >
                  <Users className="h-4 w-4" />
                  View trainees
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(b)}
                    className="rounded-full"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setConfirmDelete(b)}
                    className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit batch" : "New batch"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update batch details." : "Create a new training batch."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Batch name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. Batch June 2026"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Start date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="h-10 rounded-xl mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-10 rounded-xl mt-1">
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
              <Label className="text-xs text-neutral-600">Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="rounded-xl mt-1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="rounded-full text-white"
                style={{ backgroundColor: "#E05A2B" }}
              >
                {saving ? "Saving..." : editing ? "Save changes" : "Create batch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Trainees in this batch will be unassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
