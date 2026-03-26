import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import FormDialog from "@/components/admin/FormDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { Star } from "lucide-react";

type Review = {
  id: number; guestName: string; guestLocation: string | null;
  propertyName: string | null; quote: string; rating: number | null;
  sortOrder: number; isActive: boolean;
};

export default function AdminReviews() {
  const utils = trpc.useUtils();
  const listQ = trpc.reviews.list.useQuery();
  const createM = trpc.reviews.create.useMutation({ onSuccess: () => { utils.reviews.list.invalidate(); toast.success("Review created"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const updateM = trpc.reviews.update.useMutation({ onSuccess: () => { utils.reviews.list.invalidate(); toast.success("Review updated"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const deleteM = trpc.reviews.delete.useMutation({ onSuccess: () => { utils.reviews.list.invalidate(); toast.success("Review deleted"); } });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ guestName: "", guestLocation: "", propertyName: "", quote: "", rating: 5, sortOrder: 0, isActive: true });

  const openCreate = () => { setEditId(null); setForm({ guestName: "", guestLocation: "", propertyName: "", quote: "", rating: 5, sortOrder: 0, isActive: true }); setOpen(true); };
  const openEdit = (item: Review) => { setEditId(item.id); setForm({ guestName: item.guestName, guestLocation: item.guestLocation || "", propertyName: item.propertyName || "", quote: item.quote, rating: item.rating || 5, sortOrder: item.sortOrder, isActive: item.isActive }); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, guestLocation: form.guestLocation || undefined, propertyName: form.propertyName || undefined };
    if (editId) updateM.mutate({ id: editId, ...data }); else createM.mutate(data);
  };

  const columns: Column<Review>[] = [
    { key: "guestName", label: "Guest", render: (item) => <div><p className="font-medium text-sm">{item.guestName}</p><p className="text-xs text-muted-foreground">{item.guestLocation || "—"}</p></div> },
    { key: "propertyName", label: "Property", render: (item) => <span className="text-sm">{item.propertyName || "—"}</span> },
    { key: "quote", label: "Quote", render: (item) => <p className="text-sm text-muted-foreground line-clamp-2 max-w-[300px]">{item.quote}</p> },
    { key: "rating", label: "Rating", render: (item) => <div className="flex items-center gap-0.5">{Array.from({ length: item.rating || 5 }).map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}</div> },
    { key: "isActive", label: "Status", render: (item) => <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">{item.isActive ? "Active" : "Hidden"}</Badge> },
    { key: "sortOrder", label: "Order", render: (item) => <span className="text-xs text-muted-foreground">{item.sortOrder}</span> },
  ];

  return (
    <>
      <DataTable title="Reviews" description="Manage guest testimonials displayed on the website." columns={columns} data={(listQ.data as Review[]) || []} loading={listQ.isLoading} onAdd={openCreate} onEdit={openEdit} onDelete={(item) => deleteM.mutate({ id: item.id })} addLabel="Add review" searchField="guestName" />
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? "Edit review" : "New review"} onSubmit={handleSubmit} loading={createM.isPending || updateM.isPending}>
        <div className="space-y-2"><Label>Guest name *</Label><Input value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))} required /></div>
        <div className="space-y-2"><Label>Guest location</Label><Input value={form.guestLocation} onChange={(e) => setForm((f) => ({ ...f, guestLocation: e.target.value }))} placeholder="e.g. London, UK" /></div>
        <div className="space-y-2"><Label>Property name</Label><Input value={form.propertyName} onChange={(e) => setForm((f) => ({ ...f, propertyName: e.target.value }))} placeholder="e.g. Casa da Praia" /></div>
        <div className="space-y-2"><Label>Quote *</Label><Textarea value={form.quote} onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))} rows={4} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Rating (1-5)</Label><Input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: parseInt(e.target.value) || 5 }))} /></div>
          <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} /></div>
        </div>
        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /><Label>Active</Label></div>
      </FormDialog>
    </>
  );
}
