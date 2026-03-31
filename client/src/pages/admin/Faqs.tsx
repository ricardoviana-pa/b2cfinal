import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import FormDialog from "@/components/admin/FormDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

type Faq = {
  id: number; question: string; answer: string; category: string | null;
  sortOrder: number; isActive: boolean;
};

const CATEGORIES = ["general", "booking", "services", "properties", "payments", "cancellation"];

export default function AdminFaqs() {
  const utils = trpc.useUtils();
  const listQ = trpc.faqs.list.useQuery();
  const createM = trpc.faqs.create.useMutation({ onSuccess: () => { utils.faqs.list.invalidate(); toast.success("FAQ created"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const updateM = trpc.faqs.update.useMutation({ onSuccess: () => { utils.faqs.list.invalidate(); toast.success("FAQ updated"); setOpen(false); }, onError: (e) => toast.error(e.message) });
  const deleteM = trpc.faqs.delete.useMutation({ onSuccess: () => { utils.faqs.list.invalidate(); toast.success("FAQ deleted"); } });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ question: "", answer: "", category: "", sortOrder: 0, isActive: true });

  const openCreate = () => { setEditId(null); setForm({ question: "", answer: "", category: "", sortOrder: 0, isActive: true }); setOpen(true); };
  const openEdit = (item: Faq) => { setEditId(item.id); setForm({ question: item.question, answer: item.answer, category: item.category || "", sortOrder: item.sortOrder, isActive: item.isActive }); setOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, category: form.category || undefined };
    if (editId) updateM.mutate({ id: editId, ...data }); else createM.mutate(data);
  };

  const columns: Column<Faq>[] = [
    { key: "question", label: "Question", render: (item) => <p className="font-medium text-sm max-w-[400px] line-clamp-2">{item.question}</p> },
    { key: "category", label: "Category", render: (item) => item.category ? <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { key: "isActive", label: "Status", render: (item) => <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">{item.isActive ? "Active" : "Hidden"}</Badge> },
    { key: "sortOrder", label: "Order", render: (item) => <span className="text-xs text-muted-foreground">{item.sortOrder}</span> },
  ];

  return (
    <>
      <DataTable title="FAQs" description="Manage frequently asked questions." columns={columns} data={(listQ.data as Faq[]) || []} loading={listQ.isLoading} onAdd={openCreate} onEdit={openEdit} onDelete={(item) => deleteM.mutate({ id: item.id })} addLabel="Add FAQ" searchField="question" />
      <FormDialog open={open} onOpenChange={setOpen} title={editId ? "Edit FAQ" : "New FAQ"} onSubmit={handleSubmit} loading={createM.isPending || updateM.isPending}>
        <div className="space-y-2"><Label>Question *</Label><Input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} required /></div>
        <div className="space-y-2"><Label>Answer *</Label><Textarea value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} rows={5} required /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Category</Label><Select value={form.category || "none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} /></div>
        </div>
        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /><Label>Active</Label></div>
      </FormDialog>
    </>
  );
}
