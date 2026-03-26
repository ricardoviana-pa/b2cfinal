import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin, Eye, EyeOff, GripVertical } from "lucide-react";
import { toast } from "sonner";

type DestinationForm = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  coverImage: string;
  status: string;
  comingSoon: boolean;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm: DestinationForm = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  coverImage: "",
  status: "active",
  comingSoon: false,
  sortOrder: 0,
  isActive: true,
};

export default function AdminDestinations() {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DestinationForm>(emptyForm);

  const destinationsQ = trpc.destinations.list.useQuery();
  const createM = trpc.destinations.create.useMutation({
    onSuccess: () => {
      utils.destinations.list.invalidate();
      setDialogOpen(false);
      toast.success("Destination created");
    },
  });
  const updateM = trpc.destinations.update.useMutation({
    onSuccess: () => {
      utils.destinations.list.invalidate();
      setDialogOpen(false);
      toast.success("Destination updated");
    },
  });
  const deleteM = trpc.destinations.delete.useMutation({
    onSuccess: () => {
      utils.destinations.list.invalidate();
      toast.success("Destination deleted");
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      name: d.name || "",
      slug: d.slug || "",
      tagline: d.tagline || "",
      description: d.description || "",
      coverImage: d.coverImage || "",
      status: d.status || "active",
      comingSoon: d.comingSoon || false,
      sortOrder: d.sortOrder || 0,
      isActive: d.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateM.mutate({ id: editingId, ...form });
    } else {
      createM.mutate(form);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this destination?")) {
      deleteM.mutate({ id });
    }
  };

  const destinations = destinationsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Destinations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the regions where Portugal Active operates.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add destination
        </Button>
      </div>

      {destinationsQ.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : destinations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No destinations yet. Add your first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((d: any) => (
            <Card key={d.id} className="overflow-hidden group">
              <div className="relative h-40 bg-muted">
                {d.coverImage ? (
                  <img
                    src={d.coverImage}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MapPin className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="text-white font-semibold text-lg">{d.name}</h3>
                  <p className="text-white/70 text-xs">{d.slug}</p>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  {d.isActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-medium">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-500/90 text-white text-[10px] font-medium">
                      Inactive
                    </span>
                  )}
                  {d.comingSoon && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-medium">
                      Coming Soon
                    </span>
                  )}
                </div>
              </div>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {d.tagline || d.description || "No description"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(d)}
                    className="gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(d.id)}
                    className="gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit destination" : "New destination"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: editingId
                        ? f.slug
                        : name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/-+$/, ""),
                    }));
                  }}
                  placeholder="Minho Coast"
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  placeholder="minho"
                />
              </div>
            </div>
            <div>
              <Label>Tagline</Label>
              <Input
                value={form.tagline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tagline: e.target.value }))
                }
                placeholder="Wild Atlantic coast..."
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={4}
              />
            </div>
            <div>
              <Label>Cover image URL</Label>
              <Input
                value={form.coverImage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, coverImage: e.target.value }))
                }
                placeholder="https://..."
              />
              {form.coverImage && (
                <img
                  src={form.coverImage}
                  alt="Preview"
                  className="mt-2 h-32 w-full object-cover rounded"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
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
              <div>
                <Label>Status</Label>
                <Input
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                  placeholder="active"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isActive: v }))
                  }
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.comingSoon}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, comingSoon: v }))
                  }
                />
                <Label>Coming soon</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={createM.isPending || updateM.isPending}
              >
                {createM.isPending || updateM.isPending
                  ? "Saving..."
                  : editingId
                  ? "Update"
                  : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
