import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LocaleRouter from "./components/LocaleRouter";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ItineraryProvider } from "./contexts/ItineraryContext";
import Home from "./pages/Home";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WifiOff, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { detectAiReferrer } from "./lib/datalayer";

const ItineraryDrawer = lazy(() => import("./components/itinerary/ItineraryDrawer"));
const CookieBanner = lazy(() => import("./components/layout/CookieBanner"));

const Homes = lazy(() => import("./pages/Homes"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Destinations = lazy(() => import("./pages/Destinations"));
const DestinationDetail = lazy(() => import("./pages/DestinationDetail"));
const Services = lazy(() => import("./pages/Services"));
const Experiences = lazy(() => import("./pages/Adventures"));
const Events = lazy(() => import("./pages/Events"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Cookies = lazy(() => import("./pages/Cookies"));
const CancellationPolicy = lazy(() => import("./pages/CancellationPolicy"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const ExperienceDetail = lazy(() => import("./pages/ExperienceDetail"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogArticle = lazy(() => import("./pages/BlogArticle"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Careers = lazy(() => import("./pages/Careers"));
const Owners = lazy(() => import("./pages/Owners"));
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
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="container py-16">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="skeleton-shimmer w-full rounded" style={{ aspectRatio: '16/7' }} />
          <div className="skeleton-shimmer h-8 w-64 rounded" />
          <div className="skeleton-shimmer h-4 w-96 rounded" />
          <div className="space-y-2 pt-4">
            <div className="skeleton-shimmer h-3 w-full rounded" />
            <div className="skeleton-shimmer h-3 w-full rounded" />
            <div className="skeleton-shimmer h-3 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [visible, setVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevLocation = useRef(location);
  const isPopstate = useRef(false);

  useEffect(() => {
    const onPop = () => { isPopstate.current = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const pathChanged = location.split('?')[0] !== prevLocation.current.split('?')[0];
    const wasPop = isPopstate.current;
    isPopstate.current = false;
    prevLocation.current = location;

    if (pathChanged && !wasPop) {
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayChildren(children);
        setVisible(true);
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        requestAnimationFrame(() => { document.documentElement.style.scrollBehavior = ''; });
      }, 150);
      return () => clearTimeout(timer);
    } else if (pathChanged && wasPop) {
      setDisplayChildren(children);
    } else {
      setDisplayChildren(children);
    }
  }, [location, children]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transition: visible ? 'opacity 300ms ease-out' : 'opacity 150ms ease-in',
      }}
    >
      {displayChildren}
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
        <Route path="/concierge" component={Services} />
        <Route path="/services" component={Services} />
        <Route path="/services/:slug" component={ServiceDetail} />
        <Route path="/experiences" component={Experiences} />
        <Route path="/experiences/:slug" component={ExperienceDetail} />
        <Route path="/activities/:slug" component={ExperienceDetail} />
        <Route path="/adventures" component={Experiences} />
        <Route path="/events" component={Events} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogArticle} />
        <Route path="/faq" component={FAQ} />
        <Route path="/careers" component={Careers} />
        <Route path="/owners" component={Owners} />
        <Route path="/booking/confirmation/:id" component={BookingConfirmationPage} />
        <Route path="/login" component={Login} />
        <Route path="/account" component={Account} />
        <Route path="/owners-portal" component={OwnersRedirect} />
        <Route path="/legal/privacy" component={Privacy} />
        <Route path="/legal/terms" component={Terms} />
        <Route path="/legal/cookies" component={Cookies} />
        <Route path="/legal/cancellation-policy" component={CancellationPolicy} />
        <Route path="/admin" nest component={AdminRouter} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShow(window.scrollY > window.innerHeight * 2);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed z-[89] right-4 sm:right-6 md:right-7 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-lg transition-opacity duration-300"
      style={{
        bottom: 'calc(5rem + 56px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: '#8B7355',
        opacity: show ? 1 : 0,
        minHeight: 'auto',
        minWidth: 'auto',
      }}
      aria-label="Back to top"
    >
      <ArrowUp className="w-4 h-4 text-white" />
    </button>
  );
}

function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);
  const handleOnline = useCallback(() => setOffline(false), []);
  const handleOffline = useCallback(() => setOffline(true), []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  if (!offline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2.5"
      style={{ backgroundColor: '#F5E6C8', color: '#7A5C2E', fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 400 }}
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>{t('common.offline')}</span>
    </div>
  );
}

function App() {
  // Fire AI referrer detection once on mount
  useEffect(() => { detectAiReferrer(); }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LocaleRouter>
          <ItineraryProvider>
            <TooltipProvider>
              <Toaster />
              {/* Skip to content link for keyboard navigation */}
              <a
                href="#main-content"
                className="absolute top-0 left-0 z-[9998] px-4 py-2 bg-[#8B7355] text-white text-sm font-medium rounded-b-md transform -translate-y-full focus:translate-y-0 transition-transform"
              >
                Skip to main content
              </a>
              <OfflineBanner />
              <BackToTop />
              <Suspense fallback={null}><ItineraryDrawer /></Suspense>
              <Suspense fallback={null}><CookieBanner /></Suspense>
              <main id="main-content" role="main">
                <PageTransition><Router /></PageTransition>
              </main>
            </TooltipProvider>
          </ItineraryProvider>
        </LocaleRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
