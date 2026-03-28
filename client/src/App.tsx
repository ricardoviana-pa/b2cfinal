import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ItineraryProvider } from "./contexts/ItineraryContext";
import Home from "./pages/Home";
import { lazy, Suspense } from "react";

const ItineraryDrawer = lazy(() => import("./components/itinerary/ItineraryDrawer"));
const CookieBanner = lazy(() => import("./components/layout/CookieBanner"));

const Homes = lazy(() => import("./pages/Homes"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Destinations = lazy(() => import("./pages/Destinations"));
const DestinationDetail = lazy(() => import("./pages/DestinationDetail"));
const Services = lazy(() => import("./pages/Services"));
const Adventures = lazy(() => import("./pages/Adventures"));
const Events = lazy(() => import("./pages/Events"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Cookies = lazy(() => import("./pages/Cookies"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogArticle = lazy(() => import("./pages/BlogArticle"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Careers = lazy(() => import("./pages/Careers"));
const Owners = lazy(() => import("./pages/Owners"));
const BookingSummaryPage = lazy(() => import("./pages/booking/BookingSummaryPage"));
const BookingDetailsPage = lazy(() => import("./pages/booking/BookingDetailsPage"));
const BookingConfirmPage = lazy(() => import("./pages/booking/BookingConfirmPage"));
const BookingConfirmationPage = lazy(() => import("./pages/booking/BookingConfirmationPage"));
const AdminRouter = lazy(() => import("./pages/admin/index"));
const Login = lazy(() => import("./pages/Login"));
const Account = lazy(() => import("./pages/Account"));

/* /owners-portal redirects to external management portal */
function OwnersRedirect() {
  if (typeof window !== 'undefined') {
    window.location.href = 'https://management.portugalactive.com';
  }
  return null;
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="w-[320px] h-[180px] rounded-lg bg-[#F5F1EB] animate-pulse border border-[#E8E4DC]" />
    </div>
  );
}
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/homes" component={Homes} />
        <Route path="/homes/:slug" component={PropertyDetail} />
        <Route path="/destinations" component={Destinations} />
        <Route path="/destinations/:slug" component={DestinationDetail} />
        <Route path="/services" component={Services} />
        <Route path="/services/:slug" component={ServiceDetail} />
        <Route path="/adventures" component={Adventures} />
        <Route path="/events" component={Events} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogArticle} />
        <Route path="/faq" component={FAQ} />
        <Route path="/careers" component={Careers} />
        <Route path="/owners" component={Owners} />
        <Route path="/booking/:listingId/summary" component={BookingSummaryPage} />
        <Route path="/booking/:listingId/details" component={BookingDetailsPage} />
        <Route path="/booking/:listingId/confirm" component={BookingConfirmPage} />
        <Route path="/booking/confirmation/:id" component={BookingConfirmationPage} />
        <Route path="/login" component={Login} />
        <Route path="/account" component={Account} />
        <Route path="/owners-portal" component={OwnersRedirect} />
        <Route path="/legal/privacy" component={Privacy} />
        <Route path="/legal/terms" component={Terms} />
        <Route path="/legal/cookies" component={Cookies} />
        <Route path="/admin" nest component={AdminRouter} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ItineraryProvider>
          <TooltipProvider>
            <Toaster />
            <Suspense fallback={null}><ItineraryDrawer /></Suspense>
            <Suspense fallback={null}><CookieBanner /></Suspense>
            <Router />
          </TooltipProvider>
        </ItineraryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
