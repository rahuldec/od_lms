import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, PlayCircle, FileText, BookOpen } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
];

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Operation failed";

const ensureHttps = (url) => {
  if (!url || !url.trim()) return "";
  return url.startsWith("http") ? url : `https://${url}`;
};

const emptyForm = {
  module: "",
  day_label: "",
  sub_part: "",
  video_url: "",
  assignment_url: "",
};

export default function TrainingModules() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listTrainingModules();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingRow(null);
    setForm({ ...emptyForm, sort_order: rows.length });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setForm({
      module: row.module || "",
      day_label: row.day_label || "",
      sub_part: row.sub_part || "",
      video_url: row.video_url || "",
      assignment_url: row.assignment_url || "",
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.module.trim()) { toast.error("Module name required"); return; }
    if (!form.sub_part.trim()) { toast.error("Sub part / topic required"); return; }
    setSaving(true);
    try {
      const payload = {
        module: form.module.trim(),
        day_label: form.day_label.trim(),
        sub_part: form.sub_part.trim(),
        video_url: ensureHttps(form.video_url),
        assignment_url: ensureHttps(form.assignment_url),
      };
      if (editingRow) {
        await api.updateTrainingModule(editingRow.id, payload);
        toast.success("Updated");
      } else {
        await api.createTrainingModule({ ...payload, sort_order: rows.length });
        toast.success("Added");
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
      await api.deleteTrainingModule(confirmDelete.id);
      toast.success("Deleted");
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // group by module, preserving sort order
  const grouped = rows.reduce((acc, row) => {
    const key = row.module || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Admin</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Training Modules</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Master list of modules, videos and practice sheets used across batches.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-full text-white h-11 px-5"
          style={{ backgroundColor: "#E05A2B" }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add row
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-12 text-center">
          <BookOpen className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400 font-medium">No training modules yet</p>
          <p className="text-neutral-400 text-sm mt-1">Add your first module to get started.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([moduleName, moduleRows]) => (
            <Card key={moduleName} className="rounded-2xl border-neutral-200/80 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="h-7 w-7 rounded-lg grid place-items-center text-white text-xs font-bold"
                  style={{ backgroundColor: "#E05A2B" }}
                >
                  {moduleName.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-base font-semibold">{moduleName}</h2>
                <span className="text-xs text-neutral-400">
                  {moduleRows.length} {moduleRows.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="divide-y divide-neutral-100">
                {moduleRows.map((row) => (
                  <div key={row.id} className="flex items-start justify-between py-4 group">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-neutral-100 grid place-items-center flex-shrink-0 mt-0.5">
                        <BookOpen className="h-4 w-4 text-neutral-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {row.day_label && (
                            <span className="text-xs font-medium text-neutral-400">{row.day_label}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-neutral-900 mb-2">{row.sub_part}</p>
                        <div className="flex flex-wrap gap-3">
                          {row.video_url && (
                            <a
                              href={row.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                            >
                              <PlayCircle className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-medium">Video</span>
                            </a>
                          )}
                          {row.assignment_url && (
                            <a
                              href={row.assignment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-medium">Practice Sheet</span>
                            </a>
                          )}
                          {!row.video_url && !row.assignment_url && (
                            <span className="text-xs text-neutral-400">No links added</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => openEdit(row)}
                        className="rounded-full h-7 w-7"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => setConfirmDelete(row)}
                        className="rounded-full h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingRow ? "Edit row" : "Add row"}</DialogTitle>
            <DialogDescription>
              {editingRow ? "Update this module entry." : "Add a module/day/topic with its video and practice sheet."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Module</Label>
              <Input
                value={form.module}
                onChange={(e) => setForm({ ...form, module: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. SIS, Fee, Academic"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Day <span className="text-neutral-400">(optional)</span></Label>
              <Input
                value={form.day_label}
                onChange={(e) => setForm({ ...form, day_label: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. Day 5"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Sub Part / Topic</Label>
              <Input
                value={form.sub_part}
                onChange={(e) => setForm({ ...form, sub_part: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. Student Promote"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">
                Video Link <span className="text-neutral-400">(optional — Google Drive URL)</span>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <PlayCircle className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                <Input
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  className="h-10 rounded-xl"
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-neutral-600">
                Practice Sheet / Assignment Link <span className="text-neutral-400">(optional)</span>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <FileText className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                <Input
                  value={form.assignment_url}
                  onChange={(e) => setForm({ ...form, assignment_url: e.target.value })}
                  className="h-10 rounded-xl"
                  placeholder="https://..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {saving ? "Saving..." : editingRow ? "Save changes" : "Add row"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.sub_part}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
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
