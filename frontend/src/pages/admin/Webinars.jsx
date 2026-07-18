import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, ExternalLink, Video } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars" },
  { to: "/admin/results", label: "Results", testId: "nav-results" },
];

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Operation failed";

const emptyForm = { title: "", description: "", drive_url: "", published: true, sort_order: 0 };

const ensureHttps = (url) => {
  if (!url.trim()) return "";
  return url.startsWith("http") ? url : `https://${url}`;
};

export default function Webinars() {
  const [webinars, setWebinars] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listWebinarsAdmin();
      setWebinars(Array.isArray(data) ? data : []);
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

  const openEdit = (w) => {
    setEditing(w);
    setForm({
      title: w.title || "",
      description: w.description || "",
      drive_url: w.drive_url || "",
      published: w.published !== false,
      sort_order: w.sort_order || 0,
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (!form.drive_url.trim()) { toast.error("Drive link required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        drive_url: ensureHttps(form.drive_url),
        published: form.published,
        sort_order: Number(form.sort_order) || 0,
      };
      if (editing) {
        await api.updateWebinar(editing.id, payload);
        toast.success("Webinar updated");
      } else {
        await api.createWebinar(payload);
        toast.success("Webinar added");
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
      await api.deleteWebinar(confirmDelete.id);
      toast.success("Webinar deleted");
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
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Webinars</h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Paste a Google Drive share link - it plays on the public /webinar page.
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
          <Plus className="h-4 w-4 mr-1.5" /> Add webinar
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading...</p>
      ) : webinars.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-10 text-center">
          <Video className="h-6 w-6 mx-auto text-neutral-300 mb-2" />
          <p className="text-neutral-500 text-sm">No webinars yet. Add your first one.</p>
        </Card>
      ) : (
        <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
          <ul className="divide-y divide-neutral-100">
            {webinars.map((w) => (
              <li key={w.id} className="px-5 py-4 flex items-center gap-3.5 group">
                <div
                  className="h-9 w-9 rounded-full grid place-items-center flex-shrink-0"
                  style={{ backgroundColor: w.published ? "#E1F5EE" : "#f5f5f5" }}
                >
                  <Video className="h-4 w-4" style={{ color: w.published ? "#085041" : "#a3a3a3" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{w.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {w.description && (
                      <p className="text-xs text-neutral-500 truncate max-w-xs">{w.description}</p>
                    )}
                    <a
                      href={w.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" /> Drive link
                    </a>
                  </div>
                </div>
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: w.published ? "#E1F5EE" : "#f5f5f5",
                    color: w.published ? "#085041" : "#a3a3a3",
                  }}
                >
                  {w.published ? "Published" : "Hidden"}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(w)} className="rounded-full h-7 w-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => setConfirmDelete(w)}
                    className="rounded-full h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit webinar" : "Add webinar"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this webinar entry." : "Paste the Drive share link for the recording."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. SIS Module - Live Q&A"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Drive link</Label>
              <Input
                value={form.drive_url}
                onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
              />
              <p className="text-xs text-neutral-400 mt-1">
                Make sure sharing is set to "Anyone with the link" or embedding will fail.
              </p>
            </div>
            <div>
              <Label className="text-xs text-neutral-600">Description <span className="text-neutral-400">(optional)</span></Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="One line about this session"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-neutral-600">Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className="h-10 rounded-xl mt-1 w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-neutral-600">Published</Label>
                <Switch
                  checked={form.published}
                  onCheckedChange={(v) => setForm({ ...form, published: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="rounded-full">Cancel</Button>
              <Button type="submit" disabled={saving} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {saving ? "Saving..." : editing ? "Save changes" : "Add webinar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
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
