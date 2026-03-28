import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import FormDialog from "@/components/admin/FormDialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

type Service = {
  id: number;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  icon: string | null;
  images: string[];
  price: string | null;
  duration: string | null;
  availability: string | null;
  sortOrder: number;
  isActive: boolean;
};

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

const CATEGORIES = ["gastronomy", "wellness", "mobility", "lifestyle", "adventure"];

export default function AdminServices() {
  const utils = trpc.useUtils();
  const listQ = trpc.services.list.useQuery();
  const createM = trpc.services.create.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); toast.success("Service created"); setOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const updateM = trpc.services.update.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); toast.success("Service updated"); setOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteM = trpc.services.delete.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); toast.success("Service deleted"); },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", slug: "", tagline: "", description: "", category: "", icon: "",
    images: [] as string[], price: "", duration: "", availability: "",
    sortOrder: 0, isActive: true,
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", slug: "", tagline: "", description: "", category: "", icon: "", images: [], price: "", duration: "", availability: "", sortOrder: 0, isActive: true });
    setOpen(true);
  };

  const openEdit = (item: Service) => {
    setEditId(item.id);
    setForm({
      name: item.name, slug: item.slug, tagline: (item as any).tagline || "",
      description: item.description || "",
      category: item.category || "", icon: item.icon || "",
      images: item.images || [], price: item.price || "",
      duration: item.duration || "", availability: item.availability || "",
      sortOrder: item.sortOrder, isActive: item.isActive,
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      tagline: form.tagline || undefined,
      description: form.description || undefined,
      category: form.category || undefined,
      icon: form.icon || undefined,
      price: form.price || undefined,
      duration: form.duration || undefined,
      availability: form.availability || undefined,
    };
    if (editId) updateM.mutate({ id: editId, ...data });
    else createM.mutate(data);
  };

  const columns: Column<Service>[] = [
    {
      key: "image", label: "", className: "w-[50px]",
      render: (item) => item.images?.[0]
        ? <img src={item.images[0]} alt="" role="presentation" className="w-10 h-10 rounded object-cover" />
        : <div className="w-10 h-10 rounded bg-muted" />,
    },
    {
      key: "name", label: "Name",
      render: (item) => <div><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-muted-foreground">{item.slug}</p></div>,
    },
    {
      key: "category", label: "Category",
      render: (item) => item.category
        ? <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "isActive", label: "Status",
      render: (item) => <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">{item.isActive ? "Active" : "Draft"}</Badge>,
    },
    {
      key: "sortOrder", label: "Order",
      render: (item) => <span className="text-xs text-muted-foreground">{item.sortOrder}</span>,
    },
  ];

  return (
    <>
      <DataTable
        title="Services"
        description="Manage concierge services (chef, spa, transfers, etc.)."
        columns={columns}
        data={(listQ.data as Service[]) || []}
        loading={listQ.isLoading}
        onAdd={openCreate}
        onEdit={openEdit}
        onDelete={(item) => deleteM.mutate({ id: item.id })}
        addLabel="Add service"
        searchField="name"
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editId ? "Edit service" : "New service"}
        onSubmit={handleSubmit}
        loading={createM.isPending || updateM.isPending}
        wide
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => { const name = e.target.value; setForm((f) => ({ ...f, name, slug: editId ? f.slug : slugify(name) })); }} required />
          </div>
          <div className="space-y-2">
            <Label>Slug *</Label>
            <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={form.category || "none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Icon (Lucide name)</Label>
            <Input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="e.g. utensils, spa, car" />
          </div>
          <div className="space-y-2">
            <Label>Price</Label>
            <Input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. From 150€, On request" />
          </div>
          <div className="space-y-2">
            <Label>Duration</Label>
            <Input value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} placeholder="e.g. 3 hours, Full day" />
          </div>
          <div className="space-y-2">
            <Label>Availability</Label>
            <Input value={form.availability} onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))} placeholder="e.g. Year-round, May–October" />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Tagline</Label>
          <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="Short description for cards" />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
        </div>
        <ImageUpload images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} max={10} />
        <div className="flex items-center gap-2">
          <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
          <Label>Active</Label>
        </div>
      </FormDialog>
    </>
  );
}
