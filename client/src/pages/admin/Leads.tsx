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

  const retryM = trpc.leads.retryPartnerNotification.useMutation({
    onSuccess: (result) => {
      utils.leads.list.invalidate();
      if (result.teamNotification === "accepted") toast.success("Team notification accepted by email provider");
      else toast.error("Notification failed. The request is saved; please contact the guest manually.");
    },
    onError: () => toast.error("Could not retry notification"),
  });

  const leads = (listQ.data as Lead[]) || [];

  const exportCSV = () => {
    if (leads.length === 0) {
      toast.error("No leads to export");
      return;
    }
    const headers = ["Email", "Name", "Phone", "Source", "Status", "Message", "Date", "Home", "Check-in", "Check-out", "Guests", "Displayed EUR (unconfirmed)", "Team notification", "Guest acknowledgment"];
    const rows = leads.map((l) => [
      l.email,
      l.name || "",
      l.phone || "",
      l.source,
      l.status,
      l.message || "",
      new Date(l.createdAt).toISOString(),
      ...["propertyName", "checkin", "checkout", "guests", "total", "teamNotification", "guestNotification"].map(key => l.metadata?.[key] || ""),
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${(/^[=+@\-\t\r\n]/.test(v) ? "'" + v : v).replace(/"/g, '\"\"')}"`).join(",")),
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
      key: "metadata",
      label: "Partner request",
      render: (item) => item.source === "partner-home-request" ? (
        <div className="min-w-[220px] text-xs space-y-1">
          <p className="font-medium">#{item.id} · {item.metadata?.propertyName || item.metadata?.property || "—"}</p>
          <p>{item.metadata?.checkin || "—"} → {item.metadata?.checkout || "—"}</p>
          <p>{item.metadata?.guests || "—"} guests · EUR {item.metadata?.total || "—"} (unconfirmed)</p>
          <p>Team email: {item.metadata?.teamNotification || "No record — review"}</p>
          <p>Guest acknowledgment: {item.metadata?.guestNotification || "No record"}</p>
          <p className="text-muted-foreground">Accepted means accepted by the email provider, not confirmed delivery.</p>
        </div>
      ) : <span className="text-muted-foreground">—</span>,
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
          <p className="text-xs text-muted-foreground whitespace-pre-wrap max-w-[240px]">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
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
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Checkout started</p>
          <p className="text-2xl font-semibold">{(statsQ.data as any)?.checkout ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Availability requests</p>
          <p className="text-2xl font-semibold">{(statsQ.data as any)?.availability ?? 0}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Partner requests</p>
          <p className="text-2xl font-semibold">{statsQ.data?.partner ?? 0}</p>
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
              {/* Values are prefix-matched against lead.source server-side, so
                  each option must be a real prefix — "booking"/"other" matched
                  nothing and hid every checkout and availability lead. */}
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="newsletter">Newsletter</SelectItem>
              <SelectItem value="contact">Contact form</SelectItem>
              {/* "checkout" so apanha quem NAO deu opt-in: com consentimento o
                  lead nasce "newsletter-checkout" e cai no filtro Newsletter. */}
              <SelectItem value="checkout">Checkout (no opt-in)</SelectItem>
              <SelectItem value="search-no-availability">Availability request</SelectItem>
              <SelectItem value="partner-home-request">Partner homes</SelectItem>
              <SelectItem value="owners">Owners</SelectItem>
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
              {item.source === "partner-home-request" && item.metadata?.teamNotification !== "accepted" && (
                <DropdownMenuItem disabled={retryM.isPending} onClick={() => retryM.mutate({ id: item.id })}>
                  <Mail className="h-4 w-4 mr-2" />Notify booking team (no guest email)
                </DropdownMenuItem>
              )}
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
