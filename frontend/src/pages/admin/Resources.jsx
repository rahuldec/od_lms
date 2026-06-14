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
import { Plus, Pencil, Trash2, ExternalLink, FolderPlus, Link2, X, FileText } from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
];

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Operation failed";

const emptyLinkForm = {
  title: "",
  urls: [{ label: "", url: "" }],
  practice_sheet_url: "",
  description: "",
};
const emptyCatForm = { name: "" };

const ensureHttps = (url) => {
  if (!url.trim()) return "";
  return url.startsWith("http") ? url : `https://${url}`;
};

const parseUrls = (link) => {
  // New format: array of {label, url}
  if (Array.isArray(link.urls) && link.urls.length > 0 && typeof link.urls[0] === "object") {
    return link.urls;
  }
  // Old format: array of strings
  if (Array.isArray(link.urls) && link.urls.length > 0) {
    return link.urls.map((u) => ({ label: "", url: u }));
  }
  // Legacy single url
  if (link.url) return [{ label: "", url: link.url }];
  return [{ label: "", url: "" }];
};

export default function Resources() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState(emptyCatForm);
  const [savingCat, setSavingCat] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);

  // Link modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [linkCategoryId, setLinkCategoryId] = useState(null);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [savingLink, setSavingLink] = useState(false);
  const [confirmDeleteLink, setConfirmDeleteLink] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listResourceCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // --- Category handlers ---
  const openCreateCat = () => {
    setEditingCat(null);
    setCatForm(emptyCatForm);
    setCatModalOpen(true);
  };

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name });
    setCatModalOpen(true);
  };

  const saveCat = async (e) => {
    e?.preventDefault?.();
    if (!catForm.name.trim()) { toast.error("Category name required"); return; }
    setSavingCat(true);
    try {
      if (editingCat) {
        await api.updateResourceCategory(editingCat.id, { name: catForm.name });
        toast.success("Category updated");
      } else {
        await api.createResourceCategory({ name: catForm.name });
        toast.success("Category created");
      }
      setCatModalOpen(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingCat(false);
    }
  };

  const doDeleteCat = async () => {
    if (!confirmDeleteCat) return;
    try {
      await api.deleteResourceCategory(confirmDeleteCat.id);
      toast.success("Category deleted");
      setConfirmDeleteCat(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  // --- URL field helpers ---
  const setUrlEntry = (index, field, value) => {
    const urls = [...linkForm.urls];
    urls[index] = { ...urls[index], [field]: value };
    setLinkForm({ ...linkForm, urls });
  };

  const addUrl = () => {
    setLinkForm({ ...linkForm, urls: [...linkForm.urls, { label: "", url: "" }] });
  };

  const removeUrl = (index) => {
    const urls = linkForm.urls.filter((_, i) => i !== index);
    setLinkForm({ ...linkForm, urls: urls.length ? urls : [{ label: "", url: "" }] });
  };

  // --- Link handlers ---
  const openCreateLink = (categoryId) => {
    setEditingLink(null);
    setLinkCategoryId(categoryId);
    setLinkForm(emptyLinkForm);
    setLinkModalOpen(true);
  };

  const openEditLink = (link, categoryId) => {
    setEditingLink(link);
    setLinkCategoryId(categoryId);
    setLinkForm({
      title: link.title || "",
      urls: parseUrls(link),
      practice_sheet_url: link.practice_sheet_url || "",
      description: link.description || "",
    });
    setLinkModalOpen(true);
  };

  const saveLink = async (e) => {
    e?.preventDefault?.();
    if (!linkForm.title.trim()) { toast.error("Title required"); return; }
    const cleanUrls = linkForm.urls
      .map((entry) => ({ label: entry.label.trim(), url: ensureHttps(entry.url) }))
      .filter((entry) => entry.url);
    if (cleanUrls.length === 0) { toast.error("At least one URL required"); return; }
    setSavingLink(true);
    try {
      const payload = {
        title: linkForm.title,
        urls: cleanUrls,
        url: cleanUrls[0].url,
        practice_sheet_url: ensureHttps(linkForm.practice_sheet_url),
        description: linkForm.description,
      };
      if (editingLink) {
        await api.updateResourceLink(editingLink.id, payload);
        toast.success("Link updated");
      } else {
        await api.createResourceLink({ category_id: linkCategoryId, ...payload });
        toast.success("Link added");
      }
      setLinkModalOpen(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSavingLink(false);
    }
  };

  const doDeleteLink = async () => {
    if (!confirmDeleteLink) return;
    try {
      await api.deleteResourceLink(confirmDeleteLink.id);
      toast.success("Link deleted");
      setConfirmDeleteLink(null);
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
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Resources</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Save and organize links by category for quick access.
          </p>
        </div>
        <Button
          onClick={openCreateCat}
          className="rounded-full text-white h-11 px-5"
          style={{ backgroundColor: "#E05A2B" }}
        >
          <FolderPlus className="h-4 w-4 mr-1.5" /> New category
        </Button>
      </div>

      {loading ? (
        <p className="text-neutral-400">Loading...</p>
      ) : categories.length === 0 ? (
        <Card className="rounded-2xl border-neutral-200/80 p-12 text-center">
          <Link2 className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-400 font-medium">No categories yet</p>
          <p className="text-neutral-400 text-sm mt-1">Create a category like "SIS", "Fee", or "HR" to get started.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <Card key={cat.id} className="rounded-2xl border-neutral-200/80 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-lg grid place-items-center text-white text-xs font-bold"
                    style={{ backgroundColor: "#E05A2B" }}
                  >
                    {cat.name?.charAt(0).toUpperCase()}
                  </div>
                  <h2 className="text-base font-semibold">{cat.name}</h2>
                  <span className="text-xs text-neutral-400">
                    {(cat.links || []).length} {(cat.links || []).length === 1 ? "link" : "links"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openCreateLink(cat.id)}
                    className="rounded-full text-xs gap-1 h-8 px-3"
                    style={{ color: "#E05A2B" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add link
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEditCat(cat)} className="rounded-full h-8 w-8">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => setConfirmDeleteCat(cat)}
                    className="rounded-full h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {(cat.links || []).length === 0 ? (
                <div
                  className="border border-dashed border-neutral-200 rounded-xl px-4 py-5 text-center cursor-pointer hover:bg-neutral-50 transition-colors"
                  onClick={() => openCreateLink(cat.id)}
                >
                  <p className="text-sm text-neutral-400">No links yet — click to add one</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {(cat.links || []).map((link) => {
                    const urls = parseUrls(link);
                    return (
                      <div key={link.id} className="flex items-start justify-between py-4 group">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="h-8 w-8 rounded-lg bg-neutral-100 grid place-items-center flex-shrink-0 mt-0.5">
                            <Link2 className="h-4 w-4 text-neutral-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-900 mb-2">{link.title}</p>
                            {link.description && (
                              <p className="text-xs text-neutral-500 mb-2">{link.description}</p>
                            )}
                            {/* URLs */}
                            <div className="flex flex-col gap-1.5 mb-2">
                              {urls.filter((e) => e.url).map((entry, i) => (
                                <a
                                  key={i}
                                  href={entry.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  <span className="font-medium">{entry.label || `Link ${i + 1}`}</span>
                                  <span className="text-neutral-400 truncate max-w-xs">{entry.url}</span>
                                </a>
                              ))}
                            </div>
                            {/* Practice Sheet */}
                            {link.practice_sheet_url && (
                              <a
                                href={link.practice_sheet_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
                              >
                                <FileText className="h-3 w-3 flex-shrink-0" />
                                <span className="font-medium">Practice Sheet</span>
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => openEditLink(link, cat.id)}
                            className="rounded-full h-7 w-7"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => setConfirmDeleteLink(link)}
                            className="rounded-full h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Category Modal */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>
              {editingCat ? "Rename this category." : "Create a category like SIS, Fee, HR, etc."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCat} className="space-y-4">
            <div>
              <Label className="text-xs text-neutral-600">Category name</Label>
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm({ name: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. SIS, Fee Module, HR"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCatModalOpen(false)} className="rounded-full">Cancel</Button>
              <Button type="submit" disabled={savingCat} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {savingCat ? "Saving..." : editingCat ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Modal */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit link" : "Add link"}</DialogTitle>
            <DialogDescription>
              {editingLink ? "Update this link entry." : "Add a new link entry with URLs and optional practice sheet."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveLink} className="space-y-4">
            {/* Title */}
            <div>
              <Label className="text-xs text-neutral-600">Title</Label>
              <Input
                value={linkForm.title}
                onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="e.g. SIS Module Assignment"
                autoFocus
              />
            </div>

            {/* URLs with labels */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-neutral-600">URLs</Label>
                <button
                  type="button"
                  onClick={addUrl}
                  className="text-xs flex items-center gap-1 font-medium"
                  style={{ color: "#E05A2B" }}
                >
                  <Plus className="h-3 w-3" /> Add another URL
                </button>
              </div>
              <div className="space-y-2">
                {linkForm.urls.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={entry.label}
                      onChange={(e) => setUrlEntry(i, "label", e.target.value)}
                      className="h-10 rounded-xl w-32 flex-shrink-0"
                      placeholder="Label"
                    />
                    <Input
                      value={entry.url}
                      onChange={(e) => setUrlEntry(i, "url", e.target.value)}
                      className="h-10 rounded-xl flex-1"
                      placeholder="https://..."
                    />
                    {linkForm.urls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUrl(i)}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Practice Sheet URL */}
            <div>
              <Label className="text-xs text-neutral-600">
                Practice Sheet URL <span className="text-neutral-400">(optional — Google Drive PDF link)</span>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <FileText className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                <Input
                  value={linkForm.practice_sheet_url}
                  onChange={(e) => setLinkForm({ ...linkForm, practice_sheet_url: e.target.value })}
                  className="h-10 rounded-xl"
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-neutral-600">Description <span className="text-neutral-400">(optional)</span></Label>
              <Input
                value={linkForm.description}
                onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })}
                className="h-10 rounded-xl mt-1"
                placeholder="Brief note about this link"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLinkModalOpen(false)} className="rounded-full">Cancel</Button>
              <Button type="submit" disabled={savingLink} className="rounded-full text-white" style={{ backgroundColor: "#E05A2B" }}>
                {savingLink ? "Saving..." : editingLink ? "Save changes" : "Add link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirm */}
      <AlertDialog open={!!confirmDeleteCat} onOpenChange={(o) => !o && setConfirmDeleteCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDeleteCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>All links inside this category will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteCat} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Link Confirm */}
      <AlertDialog open={!!confirmDeleteLink} onOpenChange={(o) => !o && setConfirmDeleteLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDeleteLink?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This link will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteLink} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
