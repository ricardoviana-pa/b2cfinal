import AdminLayout from "@/components/admin/AdminLayout";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = lazy(() => import("./Dashboard"));
const Properties = lazy(() => import("./Properties"));
const Blog = lazy(() => import("./Blog"));
const Services = lazy(() => import("./Services"));
const Experiences = lazy(() => import("./Experiences"));
const Events = lazy(() => import("./Events"));
const Reviews = lazy(() => import("./Reviews"));
const Leads = lazy(() => import("./Leads"));
const Faqs = lazy(() => import("./Faqs"));
const Destinations = lazy(() => import("./Destinations"));
const Customers = lazy(() => import("./Customers"));
const Settings = lazy(() => import("./Settings"));

function AdminLoader() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}

export default function AdminRouter() {
  return (
    <AdminLayout>
      <Suspense fallback={<AdminLoader />}>
        <Switch>
          <Route path="/admin" component={Dashboard} />
          <Route path="/admin/properties" component={Properties} />
          <Route path="/admin/destinations" component={Destinations} />
          <Route path="/admin/blog" component={Blog} />
          <Route path="/admin/services" component={Services} />
          <Route path="/admin/experiences" component={Experiences} />
          <Route path="/admin/events" component={Events} />
          <Route path="/admin/reviews" component={Reviews} />
          <Route path="/admin/leads" component={Leads} />
          <Route path="/admin/faqs" component={Faqs} />
          <Route path="/admin/customers" component={Customers} />
          <Route path="/admin/settings" component={Settings} />
        </Switch>
      </Suspense>
    </AdminLayout>
  );
}
