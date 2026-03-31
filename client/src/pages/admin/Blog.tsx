import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import FormDialog from "@/components/admin/FormDialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

/* ─── Types ─── */
type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  authorId: number | null;
  category: string | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  status: "draft" | "published" | "scheduled";
  publishedAt: Date | null;
  scheduledAt: Date | null;
  readTime: number | null;
  sortOrder: number;
  createdAt: Date;
};

type BlogAuthor = {
  id: number;
  name: string;
  slug: string;
  bio: string | null;
  avatar: string | null;
  role: string | null;
  isActive: boolean;
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

const CATEGORIES = [
  "travel",
  "food",
  "wellness",
  "culture",
  "homes",
  "lifestyle",
];

/* ─── Posts tab ─── */
function PostsTab() {
  const utils = trpc.useUtils();
  const postsQ = trpc.blog.posts.list.useQuery();
  const authorsQ = trpc.blog.authors.list.useQuery();
  const createM = trpc.blog.posts.create.useMutation({
    onSuccess: () => {
      utils.blog.posts.list.invalidate();
      toast.success("Post created");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateM = trpc.blog.posts.update.useMutation({
    onSuccess: () => {
      utils.blog.posts.list.invalidate();
      toast.success("Post updated");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteM = trpc.blog.posts.delete.useMutation({
    onSuccess: () => {
      utils.blog.posts.list.invalidate();
      toast.success("Post deleted");
    },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    authorId: undefined as number | undefined,
    category: "",
    tags: [] as string[],
    seoTitle: "",
    seoDescription: "",
    status: "draft" as "draft" | "published" | "scheduled",
    readTime: 0,
    sortOrder: 0,
  });
  const [tagInput, setTagInput] = useState("");

  const openCreate = () => {
    setEditId(null);
    setForm({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      coverImage: "",
      authorId: undefined,
      category: "",
      tags: [],
      seoTitle: "",
      seoDescription: "",
      status: "draft",
      readTime: 0,
      sortOrder: 0,
    });
    setOpen(true);
  };

  const openEdit = (item: BlogPost) => {
    setEditId(item.id);
    setForm({
      title: item.title,
      slug: item.slug,
      excerpt: item.excerpt || "",
      content: item.content || "",
      coverImage: item.coverImage || "",
      authorId: item.authorId ?? undefined,
      category: item.category || "",
      tags: item.tags || [],
      seoTitle: item.seoTitle || "",
      seoDescription: item.seoDescription || "",
      status: item.status,
      readTime: item.readTime || 0,
      sortOrder: item.sortOrder,
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const editingPost = editId
      ? ((postsQ.data as BlogPost[]) || []).find((p) => p.id === editId)
      : null;
    const wasAlreadyPublished = editingPost?.status === "published";
    const data = {
      ...form,
      excerpt: form.excerpt || undefined,
      content: form.content || undefined,
      coverImage: form.coverImage || undefined,
      authorId: form.authorId || undefined,
      category: form.category || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      readTime: form.readTime || undefined,
      publishedAt:
        form.status === "published" && !wasAlreadyPublished
          ? new Date()
          : undefined,
    };
    if (editId) {
      updateM.mutate({ id: editId, ...data });
    } else {
      createM.mutate(data);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const authors = (authorsQ.data || []) as BlogAuthor[];

  const columns: Column<BlogPost>[] = [
    {
      key: "title",
      label: "Title",
      render: (item) => (
        <div>
          <p className="font-medium text-sm">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.slug}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge
          variant={
            item.status === "published"
              ? "default"
              : item.status === "scheduled"
              ? "outline"
              : "secondary"
          }
          className="text-xs capitalize"
        >
          {item.status}
        </Badge>
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (item) =>
        item.category ? (
          <Badge variant="outline" className="text-xs capitalize">
            {item.category}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "authorId",
      label: "Author",
      render: (item) => {
        const author = authors.find((a) => a.id === item.authorId);
        return (
          <span className="text-sm">
            {author?.name || "—"}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      label: "Created",
      render: (item) => (
        <span className="text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Blog posts"
        description="Manage journal articles and content."
        columns={columns}
        data={(postsQ.data as BlogPost[]) || []}
        loading={postsQ.isLoading}
        onAdd={openCreate}
        onEdit={openEdit}
        onDelete={(item) => deleteM.mutate({ id: item.id })}
        addLabel="New post"
        searchField="title"
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editId ? "Edit post" : "New post"}
        onSubmit={handleSubmit}
        loading={createM.isPending || updateM.isPending}
        wide
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                setForm((f) => ({
                  ...f,
                  title,
                  slug: editId ? f.slug : slugify(title),
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
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v: "draft" | "published" | "scheduled") =>
                setForm((f) => ({ ...f, status: v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={form.category || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, category: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Author</Label>
            <Select
              value={form.authorId?.toString() || "none"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  authorId: v === "none" ? undefined : parseInt(v),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No author</SelectItem>
                {authors.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Read time (min)</Label>
            <Input
              type="number"
              min={0}
              value={form.readTime}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  readTime: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
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
              alt="Cover preview"
              className="w-full max-w-xs h-32 object-cover rounded-lg mt-1"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Excerpt</Label>
          <Textarea
            value={form.excerpt}
            onChange={(e) =>
              setForm((f) => ({ ...f, excerpt: e.target.value }))
            }
            rows={2}
            placeholder="Short summary for cards and previews"
          />
        </div>

        <div className="space-y-2">
          <Label>Content (HTML)</Label>
          <Textarea
            value={form.content}
            onChange={(e) =>
              setForm((f) => ({ ...f, content: e.target.value }))
            }
            rows={10}
            placeholder="Full article content in HTML..."
            className="font-mono text-xs"
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addTag}>
              Add
            </Button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => removeTag(tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* SEO */}
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
      </FormDialog>
    </>
  );
}

/* ─── Authors tab ─── */
function AuthorsTab() {
  const utils = trpc.useUtils();
  const authorsQ = trpc.blog.authors.list.useQuery();
  const createM = trpc.blog.authors.create.useMutation({
    onSuccess: () => {
      utils.blog.authors.list.invalidate();
      toast.success("Author created");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateM = trpc.blog.authors.update.useMutation({
    onSuccess: () => {
      utils.blog.authors.list.invalidate();
      toast.success("Author updated");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteM = trpc.blog.authors.delete.useMutation({
    onSuccess: () => {
      utils.blog.authors.list.invalidate();
      toast.success("Author deleted");
    },
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    bio: "",
    avatar: "",
    role: "",
    isActive: true,
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", slug: "", bio: "", avatar: "", role: "", isActive: true });
    setOpen(true);
  };

  const openEdit = (item: BlogAuthor) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      slug: item.slug,
      bio: item.bio || "",
      avatar: item.avatar || "",
      role: item.role || "",
      isActive: item.isActive,
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      bio: form.bio || undefined,
      avatar: form.avatar || undefined,
      role: form.role || undefined,
    };
    if (editId) {
      updateM.mutate({ id: editId, ...data });
    } else {
      createM.mutate(data);
    }
  };

  const columns: Column<BlogAuthor>[] = [
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.avatar ? (
            <img
              src={item.avatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#8B7355]/20 flex items-center justify-center text-xs font-medium text-[#8B7355]">
              {item.name.charAt(0)}
            </div>
          )}
          <div>
            <p className="font-medium text-sm">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (item) => (
        <span className="text-sm">{item.role || "—"}</span>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (item) => (
        <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">
          {item.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Authors"
        description="Manage blog authors and contributors."
        columns={columns}
        data={(authorsQ.data as BlogAuthor[]) || []}
        loading={authorsQ.isLoading}
        onAdd={openCreate}
        onEdit={openEdit}
        onDelete={(item) => deleteM.mutate({ id: item.id })}
        addLabel="Add author"
        searchField="name"
      />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editId ? "Edit author" : "New author"}
        onSubmit={handleSubmit}
        loading={createM.isPending || updateM.isPending}
      >
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
          <Label>Role</Label>
          <Input
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="e.g. Editor, Guest Writer, Concierge Team"
          />
        </div>
        <div className="space-y-2">
          <Label>Bio</Label>
          <Textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label>Avatar URL</Label>
          <Input
            value={form.avatar}
            onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))}
            placeholder="https://..."
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
          <Label>Active</Label>
        </div>
      </FormDialog>
    </>
  );
}

/* ─── Main component ─── */
export default function AdminBlog() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="authors">Authors</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="mt-4">
          <PostsTab />
        </TabsContent>
        <TabsContent value="authors" className="mt-4">
          <AuthorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
