import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Download, MoreHorizontal, Mail, Phone, MessageSquare, Archive } from "lucide-react";

type Lead = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  status: "new" | "contacted" | "converted" | "archived";
  metadata: Record<string, string> | null;
  createdAt: Date;
};

const STATUS_COLORS: Record<string, string> = {
  new: "default",
  contacted: "outline",
  converted: "secondary",
  archived: "secondary",
};

export default function AdminLeads() {
  const utils = trpc.useUtils();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const listQ = trpc.leads.list.useQuery({
    source: sourceFilter === "all" ? undefined : sourceFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const statsQ = trpc.leads.stats.useQuery();
  const updateM = trpc.leads.update.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.stats.invalidate();
      toast.success("Lead updated");
    },
  });
  const deleteM = trpc.leads.delete.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.stats.invalidate();
      toast.success("Lead deleted");
    },
  });

  const leads = (listQ.data as Lead[]) || [];

  const exportCSV = () => {
    if (leads.length === 0) {
      toast.error("No leads to export");
      return;
    }
    const headers = ["Email", "Name", "Phone", "Source", "Status", "Message", "Date"];
    const rows = leads.map((l) => [
      l.email,
      l.name || "",
      l.phone || "",
      l.source,
      l.status,
      (l.message || "").replace(/"/g, '""'),
      new Date(l.createdAt).toISOString(),
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portugal-active-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const columns: Column<Lead>[] = [
    {
      key: "email",
      label: "Contact",
      render: (item) => (
        <div>
          <p className="font-medium text-sm">{item.email}</p>
          {item.name && (
            <p className="text-xs text-muted-foreground">{item.name}</p>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (item) => (
        <span className="text-sm">{item.phone || "—"}</span>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (item) => (
        <Badge variant="outline" className="text-xs capitalize">
          {item.source}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge
          variant={STATUS_COLORS[item.status] as any}
          className="text-xs capitalize"
        >
          {item.status}
        </Badge>
      ),
    },
    {
      key: "message",
      label: "Message",
      render: (item) =>
        item.message ? (
          <p className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]">
            {item.message}
          </p>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "createdAt",
      label: "Date",
      render: (item) => (
        <span className="text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total leads</p>
          <p className="text-2xl font-semibold">{statsQ.data?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">New</p>
          <p className="text-2xl font-semibold text-red-500">
            {statsQ.data?.newLeads ?? 0}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Newsletter</p>
          <p className="text-2xl font-semibold">
            {statsQ.data?.newsletter ?? 0}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Contact form</p>
          <p className="text-2xl font-semibold">{statsQ.data?.contact ?? 0}</p>
        </div>
      </div>

      {/* Filters + export */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="newsletter">Newsletter</SelectItem>
              <SelectItem value="contact">Contact form</SelectItem>
              <SelectItem value="owners">Owners</SelectItem>
              <SelectItem value="booking">Booking</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <DataTable
        title="Leads & Newsletter"
        description="All email submissions from the website."
        columns={columns}
        data={leads}
        loading={listQ.isLoading}
        searchField="email"
        onDelete={(item) => deleteM.mutate({ id: item.id })}
        actions={(item) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  updateM.mutate({ id: item.id, status: "contacted" })
                }
              >
                <Mail className="h-4 w-4 mr-2" />
                Mark contacted
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateM.mutate({ id: item.id, status: "converted" })
                }
              >
                <Phone className="h-4 w-4 mr-2" />
                Mark converted
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateM.mutate({ id: item.id, status: "archived" })
                }
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => deleteM.mutate({ id: item.id })}
                className="text-destructive focus:text-destructive"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}
