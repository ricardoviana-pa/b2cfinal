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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";

type DestinationForm = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  whyDescription: string;
  whyOverline: string;
  coverImage: string;
  gallery: string[];
  highlights: string[];
  howToGetHere: string;
  bestTimeToVisit: string;
  whatToExpect: string;
  status: string;
  comingSoon: boolean;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
};

const emptyForm: DestinationForm = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  whyDescription: "",
  whyOverline: "",
  coverImage: "",
  gallery: [],
  highlights: [],
  howToGetHere: "",
  bestTimeToVisit: "",
  whatToExpect: "",
  status: "active",
  comingSoon: false,
  sortOrder: 0,
  isActive: true,
  seoTitle: "",
  seoDescription: "",
};

export default function AdminDestinations() {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DestinationForm>(emptyForm);
  const [highlightInput, setHighlightInput] = useState("");
  const [galleryInput, setGalleryInput] = useState("");

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
      whyDescription: d.whyDescription || "",
      whyOverline: d.whyOverline || "",
      coverImage: d.coverImage || "",
      gallery: d.gallery || [],
      highlights: d.highlights || [],
      howToGetHere: d.howToGetHere || "",
      bestTimeToVisit: d.bestTimeToVisit || "",
      whatToExpect: d.whatToExpect || "",
      status: d.status || "active",
      comingSoon: d.comingSoon || false,
      sortOrder: d.sortOrder || 0,
      isActive: d.isActive ?? true,
      seoTitle: d.seoTitle || "",
      seoDescription: d.seoDescription || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      ...form,
      tagline: form.tagline || undefined,
      description: form.description || undefined,
      whyDescription: form.whyDescription || undefined,
      whyOverline: form.whyOverline || undefined,
      coverImage: form.coverImage || undefined,
      howToGetHere: form.howToGetHere || undefined,
      bestTimeToVisit: form.bestTimeToVisit || undefined,
      whatToExpect: form.whatToExpect || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
    };
    if (editingId) {
      updateM.mutate({ id: editingId, ...data });
    } else {
      createM.mutate(data);
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit destination" : "New destination"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-2">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((f) => ({
                        ...f,
                        name,
                        slug: editingId
                          ? f.slug
                          : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
                      }));
                    }}
                    placeholder="Minho Coast"
                  />
                </div>
                <div>
                  <Label>Slug *</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="minho"
                  />
                </div>
              </div>
              <div>
                <Label>Tagline</Label>
                <Input
                  value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                  placeholder="Wild Atlantic coast meets Portuguese tradition"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
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
                    checked={form.comingSoon}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, comingSoon: v }))}
                  />
                  <Label>Coming soon</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 mt-4">
              <div>
                <Label>Why visit — Overline</Label>
                <Input
                  value={form.whyOverline}
                  onChange={(e) => setForm((f) => ({ ...f, whyOverline: e.target.value }))}
                  placeholder="Why Minho Coast"
                />
              </div>
              <div>
                <Label>Why visit — Description</Label>
                <Textarea
                  value={form.whyDescription}
                  onChange={(e) => setForm((f) => ({ ...f, whyDescription: e.target.value }))}
                  rows={4}
                  placeholder="Explain why guests should visit this destination"
                />
              </div>
              <div>
                <Label>Highlights</Label>
                <div className="flex gap-2">
                  <Input
                    value={highlightInput}
                    onChange={(e) => setHighlightInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = highlightInput.trim();
                        if (v && !form.highlights.includes(v)) {
                          setForm((f) => ({ ...f, highlights: [...f.highlights, v] }));
                        }
                        setHighlightInput("");
                      }
                    }}
                    placeholder="Add highlight and press Enter"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const v = highlightInput.trim();
                      if (v && !form.highlights.includes(v)) {
                        setForm((f) => ({ ...f, highlights: [...f.highlights, v] }));
                      }
                      setHighlightInput("");
                    }}
                  >
                    Add
                  </Button>
                </div>
                {form.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.highlights.map((h, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-muted rounded text-xs cursor-pointer hover:bg-destructive/20"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            highlights: f.highlights.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        {h} ×
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>How to get here</Label>
                <Textarea
                  value={form.howToGetHere}
                  onChange={(e) => setForm((f) => ({ ...f, howToGetHere: e.target.value }))}
                  rows={3}
                  placeholder="Airport, driving directions, transfers..."
                />
              </div>
              <div>
                <Label>Best time to visit</Label>
                <Textarea
                  value={form.bestTimeToVisit}
                  onChange={(e) => setForm((f) => ({ ...f, bestTimeToVisit: e.target.value }))}
                  rows={2}
                  placeholder="May to October for beach weather..."
                />
              </div>
              <div>
                <Label>What to expect</Label>
                <Textarea
                  value={form.whatToExpect}
                  onChange={(e) => setForm((f) => ({ ...f, whatToExpect: e.target.value }))}
                  rows={3}
                  placeholder="Climate, vibe, activities..."
                />
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-4 mt-4">
              <div>
                <Label>Cover image URL</Label>
                <Input
                  value={form.coverImage}
                  onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
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
              <div>
                <Label>Gallery</Label>
                <div className="flex gap-2">
                  <Input
                    value={galleryInput}
                    onChange={(e) => setGalleryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = galleryInput.trim();
                        if (v) {
                          setForm((f) => ({ ...f, gallery: [...f.gallery, v] }));
                        }
                        setGalleryInput("");
                      }
                    }}
                    placeholder="Paste image URL and press Enter"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const v = galleryInput.trim();
                      if (v) {
                        setForm((f) => ({ ...f, gallery: [...f.gallery, v] }));
                      }
                      setGalleryInput("");
                    }}
                  >
                    Add
                  </Button>
                </div>
                {form.gallery.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {form.gallery.map((url, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={url}
                          alt=""
                          className="w-full h-20 object-cover rounded"
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              gallery: f.gallery.filter((_, j) => j !== i),
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-4 mt-4">
              <div>
                <Label>SEO title</Label>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                  placeholder="Custom title for search engines"
                />
              </div>
              <div>
                <Label>SEO description</Label>
                <Textarea
                  value={form.seoDescription}
                  onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
                  rows={2}
                  placeholder="Meta description for this destination"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
