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
} from "lucide-react";

const STATUSES = ["Active", "On Hold", "Exited"];

const statusBadge = (s) => {
  const map = {
    Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
    Exited: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  };
  return map[s] || "bg-neutral-100 text-neutral-600 ring-neutral-200";
};

const emptyForm = {
  name: "",
  phone: "",
  join_date: "",
  manager: "",
  status: "Active",
  notes: "",
  username: "",
  password: "",
  batch_id: "",
};

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules" },
];

const errMsg = (e) =>
  e?.response?.data?.detail || e?.message || "Operation failed";

export default function Trainees() {
  const [list, setList] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [promotingId, setPromotingId] = useState(null);
  const [demotingId, setDemotingId] = useState(null);

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
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.username?.toLowerCase().includes(q) ||
        t.manager?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
    );
  }, [list, search]);

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
      notes: t.notes || "",
      username: t.username || "",
      password: "",
      batch_id: t.batch_id || "",
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
          notes: form.notes,
          batch_id: form.batch_id || null,
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

  const promote = async (t) => {
    const next = (t.current_level ?? 0) + 1;
    if (next > 3) { toast.info("Already at Level 3"); return; }
    setPromotingId(t.id);
    try {
      await api.promoteTrainee(t.id);
      toast.success(`${t.name} promoted to Level ${next}`);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPromotingId(null);
    }
  };

  const demote = async (t) => {
    const next = (t.current_level ?? 0) - 1;
    if (next < 0) { toast.info("Already at Level 0"); return; }
    setDemotingId(t.id);
    try {
      await api.demoteTrainee(t.id);
      toast.success(`${t.name} demoted to Level ${next}`);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setDemotingId(null);
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
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            data-testid="trainee-search"
            placeholder="Search by name, username, phone, manager"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent flex-1 outline-none text-sm placeholder:text-neutral-400"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Batch</th>
                <th className="px-5 py-3 font-medium">Manager</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Level</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-neutral-400">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-neutral-400">
                    No trainees yet. Click "Add trainee" to get started.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
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
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          data-testid={`promote-${t.id}`}
                          size="sm"
                          variant="outline"
                          disabled={(t.current_level ?? 0) >= 3 || promotingId === t.id}
                          onClick={() => promote(t)}
                          className="rounded-full"
                        >
                          <TrendingUp className="h-3.5 w-3.5 mr-1" />
                          Promote
                        </Button>
                        <Button
                          data-testid={`demote-${t.id}`}
                          size="sm"
                          variant="outline"
                          disabled={(t.current_level ?? 0) <= 0 || demotingId === t.id}
                          onClick={() => demote(t)}
                          className="rounded-full"
                        >
                          <TrendingDown className="h-3.5 w-3.5 mr-1" />
                          Demote
                        </Button>
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
    </AppShell>
  );
}
