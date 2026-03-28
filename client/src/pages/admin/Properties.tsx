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

type Property = {
  id: number;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  destination: string;
  region: string | null;
  locality: string | null;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  priceFrom: number;
  tier: "standard" | "signature" | "ultra";
  images: string[];
  amenities: Record<string, string[]>;
  guestyUrl: string | null;
  guestyId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
};

const emptyForm = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  destination: "minho",
  region: "",
  locality: "",
  bedrooms: 0,
  bathrooms: 0,
  maxGuests: 0,
  priceFrom: 0,
  tier: "standard" as "standard" | "signature" | "ultra",
  images: [] as string[],
  amenities: {} as Record<string, string[]>,
  amenitiesText: "",
  guestyUrl: "",
  guestyId: "",
  seoTitle: "",
  seoDescription: "",
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function AdminProperties() {
  const utils = trpc.useUtils();
  const listQ = trpc.properties.list.useQuery();
  const createM = trpc.properties.create.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property created");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateM = trpc.properties.update.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property updated");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteM = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Property deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const reorderM = trpc.properties.reorder.useMutation({
    onSuccess: () => {
      utils.properties.list.invalidate();
      toast.success("Order saved");
    },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: Property) => {
    setEditId(item.id);
    const am = item.amenities || {};
    setForm({
      name: item.name,
      slug: item.slug,
      tagline: item.tagline || "",
      description: item.description || "",
      destination: item.destination,
      region: item.region || "",
      locality: item.locality || "",
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms || 0,
      maxGuests: item.maxGuests,
      priceFrom: item.priceFrom,
      tier: item.tier as "standard" | "signature" | "ultra",
      images: item.images || [],
      amenities: am,
      amenitiesText: Object.entries(am)
        .map(([cat, items]) => `${cat}: ${(items as string[]).join(", ")}`)
        .join("\n"),
      guestyUrl: item.guestyUrl || "",
      guestyId: item.guestyId || "",
      seoTitle: item.seoTitle || "",
      seoDescription: item.seoDescription || "",
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isFeatured: item.isFeatured,
    });
    setOpen(true);
  };

  const parseAmenities = (text: string): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    for (const line of text.split("\n")) {
      const [cat, ...rest] = line.split(":");
      if (cat && rest.length > 0) {
        result[cat.trim()] = rest
          .join(":")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    return result;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { amenitiesText, ...rest } = form;
    const data = {
      ...rest,
      tagline: form.tagline || undefined,
      description: form.description || undefined,
      region: form.region || undefined,
      locality: form.locality || undefined,
      guestyUrl: form.guestyUrl || undefined,
      guestyId: form.guestyId || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      amenities: amenitiesText.trim()
        ? parseAmenities(amenitiesText)
        : form.amenities,
    };
    if (editId) {
      updateM.mutate({ id: editId, ...data });
    } else {
      createM.mutate(data);
    }
  };

  const columns: Column<Property>[] = [
    {
      key: "image",
      label: "",
      className: "w-[50px]",
      render: (item) =>
        item.images?.[0] ? (
          <img
            src={item.images[0]}
            alt=""
            className="w-10 h-10 rounded object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted" />
        ),
    },
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <div>
          <p className="font-medium text-sm">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.slug}</p>
        </div>
      ),
    },
    {
      key: "destination",
      label: "Destination",
      render: (item) => (
        <Badge variant="outline" className="text-xs capitalize">
          {item.destination}
        </Badge>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      render: (item) => (
        <Badge
          variant={item.tier === "signature" ? "default" : "outline"}
          className="text-xs capitalize"
        >
          {item.tier}
        </Badge>
      ),
    },
    {
      key: "bedrooms",
      label: "Beds",
      render: (item) => <span className="text-sm">{item.bedrooms}</span>,
    },
    {
      key: "priceFrom",
      label: "From",
      render: (item) => (
        <span className="text-sm font-medium">€{item.priceFrom}</span>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (item) => (
        <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">
          {item.isActive ? "Active" : "Draft"}
        </Badge>
      ),
    },
    {
      key: "sortOrder",
      label: "Order",
      render: (item) => (
        <span className="text-xs text-muted-foreground">{item.sortOrder}</span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Properties"
        description="Manage your portfolio of homes."
        columns={columns}
        data={(listQ.data as unknown as Property[]) || []}
        loading={listQ.isLoading}
        onAdd={openCreate}
        onEdit={openEdit}
        onDelete={(item) => deleteM.mutate({ id: item.id })}
        addLabel="Add property"
        searchField="name"
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editId ? "Edit property" : "New property"}
        onSubmit={handleSubmit}
        loading={createM.isPending || updateM.isPending}
        wide
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  slug: editId ? f.slug : slugify(name),
                }));
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Slug *</Label>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Destination *</Label>
            <Select
              value={form.destination}
              onValueChange={(v) => setForm((f) => ({ ...f, destination: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minho">Minho Coast</SelectItem>
                <SelectItem value="porto">Porto and Douro</SelectItem>
                <SelectItem value="algarve">Algarve</SelectItem>
                <SelectItem value="lisbon">Lisbon</SelectItem>
                <SelectItem value="alentejo">Alentejo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Region</Label>
            <Input
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder="e.g. Caminha, Viana do Castelo"
            />
          </div>
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select
              value={form.tier}
              onValueChange={(v: "standard" | "signature" | "ultra") =>
                setForm((f) => ({ ...f, tier: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="signature">Signature</SelectItem>
                <SelectItem value="ultra">Ultra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Locality</Label>
            <Input
              value={form.locality}
              onChange={(e) => setForm((f) => ({ ...f, locality: e.target.value }))}
              placeholder="e.g. Vila Nova de Cerveira"
            />
          </div>
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <Input
              type="number"
              min={0}
              value={form.bedrooms}
              onChange={(e) =>
                setForm((f) => ({ ...f, bedrooms: parseInt(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Bathrooms</Label>
            <Input
              type="number"
              min={0}
              value={form.bathrooms}
              onChange={(e) =>
                setForm((f) => ({ ...f, bathrooms: parseInt(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max guests</Label>
            <Input
              type="number"
              min={0}
              value={form.maxGuests}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  maxGuests: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Price from (€/night)</Label>
            <Input
              type="number"
              min={0}
              value={form.priceFrom}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priceFrom: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sortOrder: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Guesty ID</Label>
            <Input
              value={form.guestyId}
              onChange={(e) =>
                setForm((f) => ({ ...f, guestyId: e.target.value }))
              }
              placeholder="Guesty listing ID"
            />
          </div>
          <div className="space-y-2">
            <Label>Guesty booking URL</Label>
            <Input
              value={form.guestyUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, guestyUrl: e.target.value }))
              }
              placeholder="https://booking.portugalactive.com/..."
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tagline</Label>
          <Input
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            placeholder="Short description for cards"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={4}
            placeholder="Full property description"
          />
        </div>

        <div className="space-y-2">
          <Label>Amenities</Label>
          <Textarea
            value={form.amenitiesText}
            onChange={(e) =>
              setForm((f) => ({ ...f, amenitiesText: e.target.value }))
            }
            rows={4}
            placeholder={"general: WiFi, Pool, Air Conditioning\nkitchen: Oven, Dishwasher\noutdoor: Garden, BBQ, Terrace"}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            One category per line. Format: category: item1, item2, item3
          </p>
        </div>

        <ImageUpload
          images={form.images}
          onChange={(images) => setForm((f) => ({ ...f, images }))}
          max={20}
        />

        <div className="border-t pt-4 space-y-4">
          <p className="text-sm font-medium text-muted-foreground">SEO</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SEO title</Label>
              <Input
                value={form.seoTitle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seoTitle: e.target.value }))
                }
                placeholder="Custom title for search engines"
              />
            </div>
            <div className="space-y-2">
              <Label>SEO description</Label>
              <Input
                value={form.seoDescription}
                onChange={(e) =>
                  setForm((f) => ({ ...f, seoDescription: e.target.value }))
                }
                placeholder="Meta description"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
            <Label>Active</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isFeatured}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
            />
            <Label>Featured on homepage</Label>
          </div>
        </div>
      </FormDialog>
    </>
  );
}
