import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  FileText,
  Star,
  Mail,
  CalendarDays,
  Utensils,
  Compass,
  HelpCircle,
  TrendingUp,
  Users,
  MessageSquare,
  Inbox,
  MapPin,
} from "lucide-react";
import { Link } from "wouter";

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  loading,
  accent,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  href: string;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer border-border/50">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-semibold tracking-tight">{value}</p>
              )}
            </div>
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: accent ? `${accent}15` : "#8B735515" }}
            >
              <Icon
                className="h-5 w-5"
                style={{ color: accent || "#8B7355" }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminDashboard() {
  const propertiesQ = trpc.properties.list.useQuery();
  const destinationsQ = trpc.destinations.list.useQuery();
  const servicesQ = trpc.services.list.useQuery();
  const experiencesQ = trpc.experiences.list.useQuery();
  const eventsQ = trpc.events.list.useQuery();
  const postsQ = trpc.blog.posts.list.useQuery();
  const reviewsQ = trpc.reviews.list.useQuery();
  const leadsQ = trpc.leads.stats.useQuery();
  const faqsQ = trpc.faqs.list.useQuery();

  const loading =
    propertiesQ.isLoading ||
    destinationsQ.isLoading ||
    servicesQ.isLoading ||
    experiencesQ.isLoading ||
    eventsQ.isLoading ||
    postsQ.isLoading ||
    reviewsQ.isLoading ||
    leadsQ.isLoading ||
    faqsQ.isLoading;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your website content and leads.
        </p>
      </div>

      {/* Content stats */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Content
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Properties"
            value={propertiesQ.data?.length ?? 0}
            icon={Building2}
            href="/admin/properties"
            loading={loading}
            accent="#8B7355"
          />
          <StatCard
            title="Destinations"
            value={destinationsQ.data?.length ?? 0}
            icon={MapPin}
            href="/admin/destinations"
            loading={loading}
            accent="#059669"
          />
          <StatCard
            title="Blog posts"
            value={postsQ.data?.length ?? 0}
            icon={FileText}
            href="/admin/blog"
            loading={loading}
            accent="#3B82F6"
          />
          <StatCard
            title="Reviews"
            value={reviewsQ.data?.length ?? 0}
            icon={Star}
            href="/admin/reviews"
            loading={loading}
            accent="#F59E0B"
          />
          <StatCard
            title="Events"
            value={eventsQ.data?.length ?? 0}
            icon={CalendarDays}
            href="/admin/events"
            loading={loading}
            accent="#10B981"
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Services & Experiences
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Services"
            value={servicesQ.data?.length ?? 0}
            icon={Utensils}
            href="/admin/services"
            loading={loading}
            accent="#8B5CF6"
          />
          <StatCard
            title="Experiences"
            value={experiencesQ.data?.length ?? 0}
            icon={Compass}
            href="/admin/experiences"
            loading={loading}
            accent="#EC4899"
          />
          <StatCard
            title="FAQs"
            value={faqsQ.data?.length ?? 0}
            icon={HelpCircle}
            href="/admin/faqs"
            loading={loading}
            accent="#6366F1"
          />
          <StatCard
            title="Total leads"
            value={leadsQ.data?.total ?? 0}
            icon={Mail}
            href="/admin/leads"
            loading={loading}
            accent="#EF4444"
          />
        </div>
      </div>

      {/* Leads breakdown */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Leads breakdown
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="New leads"
            value={leadsQ.data?.newLeads ?? 0}
            icon={Inbox}
            href="/admin/leads"
            loading={loading}
            accent="#EF4444"
          />
          <StatCard
            title="Newsletter"
            value={leadsQ.data?.newsletter ?? 0}
            icon={TrendingUp}
            href="/admin/leads"
            loading={loading}
            accent="#F97316"
          />
          <StatCard
            title="Contact form"
            value={leadsQ.data?.contact ?? 0}
            icon={MessageSquare}
            href="/admin/leads"
            loading={loading}
            accent="#14B8A6"
          />
          <StatCard
            title="Total subscribers"
            value={leadsQ.data?.total ?? 0}
            icon={Users}
            href="/admin/leads"
            loading={loading}
            accent="#8B7355"
          />
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/admin/properties">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-border/50 group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-[#8B7355]/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-[#8B7355]" />
                </div>
                <div>
                  <p className="font-medium text-sm group-hover:text-[#8B7355] transition-colors">
                    Add new property
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add a home to the portfolio
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/blog">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-border/50 group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm group-hover:text-blue-500 transition-colors">
                    Write a blog post
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Create a new journal article
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/leads">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-border/50 group">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-sm group-hover:text-red-500 transition-colors">
                    Export leads
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Download CSV for Mailchimp
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
