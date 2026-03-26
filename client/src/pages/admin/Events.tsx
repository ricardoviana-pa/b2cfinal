import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import FormDialog from "@/components/admin/FormDialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

type Event = {
  id: number; title: string; slug: string; description: string | null;
  shortDescription: string | null; eventType: string | null;
  coverImage: string | null; images: string[]; capacity: string | null;
  sortOrder: number; isActive: boolean;
};

function slugify(t: string) { return t.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(); }

const EVENT_TYPES = ["wedding", "corporate", "retreat", "celebration", "brand-activation", "private-party"];

export default function AdminEvents() {
  const utils = trpc.useUtils();
  const listQ = trpc.events.list.useQuery();
  const createM = trpc.events.create.useMutation({ onSuccess: () => { utils.events.list.invalidate(); toast.success("Event created"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const updateM = trpc.events.update.useMutation({ onSuccess: () => { utils.events.list.invalidate(); toast.success("Event updated"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const deleteM = trpc.events.delete.useMutation({ onSuccess: () => { utils.events.list.invalidate(); toast.success("Event deleted"); } });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", slug: "", description: "", shortDescription: "", eventType: "", coverImage: "", images: [] as string[], capacity: "", sortOrder: 0, isActive: true });

  const openCreate = () => { setEditId(null); setForm({ title: "", slug: "", description: "", shortDescription: "", eventType: "", coverImage: "", images: [], capacity: "", sortOrder: 0, isActive: true }); setOpen(true); };
  const openEdit = (item: Event) => { setEditId(item.id); setForm({ title: item.title, slug: item.slug, description: item.description || "", shortDescription: item.shortDescription || "", eventType: item.eventType || "", coverImage: item.coverImage || "", images: item.images || [], capacity: item.capacity || "", sortOrder: item.sortOrder, isActive: item.isActive }); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, description: form.description || undefined, shortDescription: form.shortDescription || undefined, eventType: form.eventType || undefined, coverImage: form.coverImage || undefined, capacity: form.capacity || undefined };
    if (editId) updateM.mutate({ id: editId, ...data }); else createM.mutate(data);
  };

  const columns: Column<Event>[] = [
    { key: "image", label: "", className: "w-[50px]", render: (item) => item.coverImage ? <img src={item.coverImage} alt="" className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-muted" /> },
    { key: "title", label: "Title", render: (item) => <div><p className="font-medium text-sm">{item.title}</p><p className="text-xs text-muted-foreground">{item.slug}</p></div> },
    { key: "eventType", label: "Type", render: (item) => item.eventType ? <Badge variant="outline" className="text-xs capitalize">{item.eventType.replace("-", " ")}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { key: "capacity", label: "Capacity", render: (item) => <span className="text-sm">{item.capacity || "—"}</span> },
    { key: "isActive", label: "Status", render: (item) => <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">{item.isActive ? "Active" : "Draft"}</Badge> },
  ];

  return (
    <>
      <DataTable title="Events" description="Manage event types (weddings, retreats, corporate, etc.)." columns={columns} data={(listQ.data as Event[]) || []} loading={listQ.isLoading} onAdd={openCreate} onEdit={openEdit} onDelete={(item) => deleteM.mutate({ id: item.id })} addLabel="Add event type" searchField="title" />
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? "Edit event" : "New event type"} onSubmit={handleSubmit} loading={createM.isPending || updateM.isPending} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => { const t = e.target.value; setForm((f) => ({ ...f, title: t, slug: editId ? f.slug : slugify(t) })); }} required /></div>
          <div className="space-y-2"><Label>Slug *</Label><Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></div>
          <div className="space-y-2"><Label>Event type</Label><Select value={form.eventType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, eventType: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No type</SelectItem>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("-", " ")}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Capacity</Label><Input value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 20-200 guests" /></div>
          <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} /></div>
        </div>
        <div className="space-y-2"><Label>Short description</Label><Input value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} /></div>
        <div className="space-y-2"><Label>Cover image URL</Label><Input value={form.coverImage} onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))} placeholder="https://..." /></div>
        <ImageUpload images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} max={10} />
        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /><Label>Active</Label></div>
      </FormDialog>
    </>
  );
}
