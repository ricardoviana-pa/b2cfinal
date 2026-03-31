import { trpc } from "@/lib/trpc";
import DataTable, { Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Customer = {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  avatar: string | null;
  phone: string | null;
  nationality: string | null;
  referralCode: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalStays: number;
  totalNights: number;
  createdAt: Date;
};

type Trip = {
  id: number;
  userId: number;
  propertyName: string;
  propertyImage: string | null;
  destination: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  totalPrice: number | null;
  currency: string | null;
  status: string;
  confirmationCode: string | null;
  pointsEarned: number;
  createdAt: Date;
};

type Referral = {
  id: number;
  referrerId: number;
  referredEmail: string;
  referredUserId: number | null;
  status: string;
  pointsAwarded: number;
  createdAt: Date;
};

const TIER_COLORS: Record<string, string> = {
  bronze: "outline",
  silver: "secondary",
  gold: "default",
  platinum: "default",
};

function CustomersTab() {
  const customersQ = trpc.customer.adminListCustomers.useQuery();
  const customers = (customersQ.data as Customer[]) || [];

  const columns: Column<Customer>[] = [
    {
      key: "name",
      label: "Customer",
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.avatar ? (
            <img src={item.avatar} alt="" role="presentation" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#8B7355]/20 flex items-center justify-center text-xs font-medium text-[#8B7355]">
              {(item.userName || item.userEmail || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-sm">{item.userName || "—"}</p>
            <p className="text-xs text-muted-foreground">{item.userEmail}</p>
          </div>
        </div>
      ),
    },
    {
      key: "loyaltyTier",
      label: "Tier",
      render: (item) => (
        <Badge variant={TIER_COLORS[item.loyaltyTier] as any} className="text-xs capitalize">
          {item.loyaltyTier}
        </Badge>
      ),
    },
    {
      key: "loyaltyPoints",
      label: "Points",
      render: (item) => (
        <span className="text-sm font-medium">{item.loyaltyPoints.toLocaleString()}</span>
      ),
    },
    {
      key: "totalStays",
      label: "Stays",
      render: (item) => <span className="text-sm">{item.totalStays}</span>,
    },
    {
      key: "totalNights",
      label: "Nights",
      render: (item) => <span className="text-sm">{item.totalNights}</span>,
    },
    {
      key: "referralCode",
      label: "Referral code",
      render: (item) => (
        <span className="text-xs font-mono text-muted-foreground">{item.referralCode || "—"}</span>
      ),
    },
    {
      key: "createdAt",
      label: "Joined",
      render: (item) => (
        <span className="text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      title="Customers"
      description="All registered customer accounts."
      columns={columns}
      data={customers}
      loading={customersQ.isLoading}
      searchField="userName"
    />
  );
}

function TripsTab() {
  const tripsQ = trpc.customer.adminListTrips.useQuery();
  const trips = (tripsQ.data as Trip[]) || [];

  const STATUS_COLORS: Record<string, string> = {
    upcoming: "outline",
    active: "default",
    completed: "secondary",
    cancelled: "destructive",
  };

  const columns: Column<Trip>[] = [
    {
      key: "property",
      label: "Property",
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.propertyImage ? (
            <img src={item.propertyImage} alt="" role="presentation" className="w-10 h-8 rounded object-cover" />
          ) : (
            <div className="w-10 h-8 rounded bg-muted" />
          )}
          <div>
            <p className="font-medium text-sm line-clamp-1">{item.propertyName}</p>
            {item.destination && (
              <p className="text-xs text-muted-foreground capitalize">{item.destination}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "dates",
      label: "Dates",
      render: (item) => (
        <div className="text-sm">
          <span>{item.checkIn}</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span>{item.checkOut}</span>
        </div>
      ),
    },
    {
      key: "guests",
      label: "Guests",
      render: (item) => <span className="text-sm">{item.guests}</span>,
    },
    {
      key: "nights",
      label: "Nights",
      render: (item) => <span className="text-sm">{item.nights}</span>,
    },
    {
      key: "totalPrice",
      label: "Total",
      render: (item) => (
        <span className="text-sm font-medium">
          {item.totalPrice ? `€${(item.totalPrice / 100).toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge variant={STATUS_COLORS[item.status] as any} className="text-xs capitalize">
          {item.status}
        </Badge>
      ),
    },
    {
      key: "pointsEarned",
      label: "Points",
      render: (item) => (
        <span className="text-xs text-muted-foreground">{item.pointsEarned > 0 ? `+${item.pointsEarned}` : "—"}</span>
      ),
    },
  ];

  return (
    <DataTable
      title="Trips"
      description="All customer bookings and trip history."
      columns={columns}
      data={trips}
      loading={tripsQ.isLoading}
      searchField="propertyName"
    />
  );
}

function ReferralsTab() {
  const referralsQ = trpc.customer.adminListReferrals.useQuery();
  const referrals = (referralsQ.data as Referral[]) || [];

  const STATUS_COLORS: Record<string, string> = {
    pending: "outline",
    signed_up: "secondary",
    booked: "default",
    completed: "default",
  };

  const columns: Column<Referral>[] = [
    {
      key: "referredEmail",
      label: "Referred email",
      render: (item) => <span className="text-sm">{item.referredEmail}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <Badge variant={STATUS_COLORS[item.status] as any} className="text-xs capitalize">
          {item.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "pointsAwarded",
      label: "Points awarded",
      render: (item) => (
        <span className="text-sm">{item.pointsAwarded > 0 ? `+${item.pointsAwarded}` : "—"}</span>
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
    <DataTable
      title="Referrals"
      description="All referral invitations and their status."
      columns={columns}
      data={referrals}
      loading={referralsQ.isLoading}
      searchField="referredEmail"
    />
  );
}

export default function AdminCustomers() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="trips">Trips</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4">
          <CustomersTab />
        </TabsContent>
        <TabsContent value="trips" className="mt-4">
          <TripsTab />
        </TabsContent>
        <TabsContent value="referrals" className="mt-4">
          <ReferralsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
