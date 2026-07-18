import React, { useEffect, useRef, useState } from "react";
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
import { Plus, Trash2, FileText, Eye, EyeOff, Upload, ExternalLink } from "lucide-react";

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

const emptyForm = { title: "", cycle: "", file: null };

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listResultsAdmin();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a PDF file");
      return;
    }
    setForm((prev) => ({ ...prev, file: f, title: prev.title || f.name.replace(/\.pdf$/i, "") }));
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (!form.file) { toast.error("Please attach a PDF"); return; }
    setSaving(true);
    try {
      await api.uploadResult({ title: form.title, cycle: form.cycle, file: form.file });
      toast.success("Result published to trainee portal and dashboard");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (r) => {
    try {
      await api.updateResult(r.id, { published: !r.published });
      toast.success(r.published ? "Unpublished" : "Published");
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteResult(confirmDelete.id);
      toast.success("Result deleted");
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
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Admin</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Results</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Upload result PDFs to publish them on the trainee portal and admin dashboard.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-full text-white h-11 px-5"
          style={{ backgroundColor: "#E05A2B" }}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Publish result
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : results.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-12 text-center">
          <FileText className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400 font-medium">No results published yet</p>
          <p className="text-neutral-400 text-sm mt-1">Upload a result PDF to make it visible to trainees.</p>
        </Card>
      ) : (
        <Card className="rounded-2xl border-neutral-200/80 divide-y divide-neutral-100">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-xl bg-neutral-100 grid place-items-center flex-shrink-0">
                  <FileText className="h-4.5 w-4.5 text-neutral-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{r.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {r.cycle ? `${r.cycle} · ` : ""}{r.file_name}
                    {" · "}
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    color: r.published ? "#16a34a" : "#6b7280",
                    backgroundColor: r.published ? "#DCFCE7" : "#F3F4F6",
                  }}
                >
                  {r.published ? "Published" : "Unpublished"}
                </span>
                <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost" className="rounded-full h-8 w-8" title="View PDF">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => togglePublish(r)}
                  className="rounded-full h-8 w-8"
                  title={r.published ? "Unpublish" : "Publish"}
                >
                  {r.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => setConfirmDelete(r)}
                  className="rounded-full h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Upload Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Publish result</DialogTitle>
            <DialogDescription>
              Upload a result PDF. It will immediately show up on the trainee portal and admin dashboard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. TED Review Result — July 2026"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Cycle / label (optional)</Label>
              <Input
                value={form.cycle}
                onChange={(e) => setForm({ ...form, cycle: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. Jul 2026"
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Result PDF</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 border border-dashed border-neutral-300 rounded-xl px-4 py-5 text-center cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                <Upload className="h-5 w-5 text-neutral-400 mx-auto mb-1.5" />
                <p className="text-sm text-neutral-600 font-medium">
                  {form.file ? form.file.name : "Click to choose a PDF"}
                </p>
                {!form.file && <p className="text-xs text-neutral-400 mt-0.5">Max 20MB</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                className="hidden"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {saving ? "Publishing..." : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this result?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes "{confirmDelete?.title}" from the trainee portal and admin dashboard. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="rounded-full bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
