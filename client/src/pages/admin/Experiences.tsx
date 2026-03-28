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

type Experience = {
  id: number; name: string; slug: string; description: string | null;
  shortDescription: string | null; category: string | null; destination: string | null;
  duration: string | null; priceFrom: number | null; images: string[];
  sortOrder: number; isActive: boolean;
};

function slugify(t: string) { return t.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim(); }

const CATEGORIES = ["adventure", "culture", "gastronomy", "wellness", "nature"];
const DESTINATIONS = ["minho", "porto", "algarve", "lisbon", "alentejo"];

export default function AdminExperiences() {
  const utils = trpc.useUtils();
  const listQ = trpc.experiences.list.useQuery();
  const createM = trpc.experiences.create.useMutation({ onSuccess: () => { utils.experiences.list.invalidate(); toast.success("Experience created"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const updateM = trpc.experiences.update.useMutation({ onSuccess: () => { utils.experiences.list.invalidate(); toast.success("Experience updated"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const deleteM = trpc.experiences.delete.useMutation({ onSuccess: () => { utils.experiences.list.invalidate(); toast.success("Experience deleted"); } });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", shortDescription: "", category: "", destination: "", duration: "", priceFrom: 0, images: [] as string[], sortOrder: 0, isActive: true });

  const openCreate = () => { setEditId(null); setForm({ name: "", slug: "", description: "", shortDescription: "", category: "", destination: "", duration: "", priceFrom: 0, images: [], sortOrder: 0, isActive: true }); setOpen(true); };
  const openEdit = (item: Experience) => { setEditId(item.id); setForm({ name: item.name, slug: item.slug, description: item.description || "", shortDescription: item.shortDescription || "", category: item.category || "", destination: item.destination || "", duration: item.duration || "", priceFrom: item.priceFrom || 0, images: item.images || [], sortOrder: item.sortOrder, isActive: item.isActive }); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, description: form.description || undefined, shortDescription: form.shortDescription || undefined, category: form.category || undefined, destination: form.destination || undefined, duration: form.duration || undefined };
    if (editId) updateM.mutate({ id: editId, ...data }); else createM.mutate(data);
  };

  const columns: Column<Experience>[] = [
    { key: "image", label: "", className: "w-[50px]", render: (item) => item.images?.[0] ? <img src={item.images[0]} alt="" role="presentation" className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-muted" /> },
    { key: "name", label: "Name", render: (item) => <div><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-muted-foreground">{item.slug}</p></div> },
    { key: "category", label: "Category", render: (item) => item.category ? <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { key: "destination", label: "Destination", render: (item) => item.destination ? <Badge variant="outline" className="text-xs capitalize">{item.destination}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { key: "priceFrom", label: "From", render: (item) => <span className="text-sm">€{item.priceFrom || 0}</span> },
    { key: "isActive", label: "Status", render: (item) => <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">{item.isActive ? "Active" : "Draft"}</Badge> },
  ];

  return (
    <>
      <DataTable title="Experiences" description="Manage bookable experiences and adventures." columns={columns} data={(listQ.data as Experience[]) || []} loading={listQ.isLoading} onAdd={openCreate} onEdit={openEdit} onDelete={(item) => deleteM.mutate({ id: item.id })} addLabel="Add experience" searchField="name" />
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? "Edit experience" : "New experience"} onSubmit={handleSubmit} loading={createM.isPending || updateM.isPending} wide>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => { const n = e.target.value; setForm((f) => ({ ...f, name: n, slug: editId ? f.slug : slugify(n) })); }} required /></div>
          <div className="space-y-2"><Label>Slug *</Label><Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></div>
          <div className="space-y-2"><Label>Category</Label><Select value={form.category || "none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Destination</Label><Select value={form.destination || "none"} onValueChange={(v) => setForm((f) => ({ ...f, destination: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">All destinations</SelectItem>{DESTINATIONS.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Duration</Label><Input value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} placeholder="e.g. 2 hours, Half day" /></div>
          <div className="space-y-2"><Label>Price from (€)</Label><Input type="number" min={0} value={form.priceFrom} onChange={(e) => setForm((f) => ({ ...f, priceFrom: parseInt(e.target.value) || 0 }))} /></div>
          <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} /></div>
        </div>
        <div className="space-y-2"><Label>Short description</Label><Input value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} placeholder="One-line summary" /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} /></div>
        <ImageUpload images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} max={10} />
        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /><Label>Active</Label></div>
      </FormDialog>
    </>
  );
}
