import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Building2,
  FileText,
  Star,
  Mail,
  CalendarDays,
  Utensils,
  Compass,
  HelpCircle,
  Settings,
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  Menu,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/properties", label: "Properties", icon: Building2 },
  { href: "/admin/destinations", label: "Destinations", icon: MapPin },
  { href: "/admin/blog", label: "Blog", icon: FileText },
  { href: "/admin/services", label: "Services", icon: Utensils },
  { href: "/admin/experiences", label: "Experiences", icon: Compass },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/leads", label: "Leads", icon: Mail },
  { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { data: loginModeData } = trpc.auth.getLoginMode.useQuery();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const loginMode = loginModeData?.mode ?? "none";

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, returnPath: "/admin" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.error || "Invalid password");
      } else if (data.redirect) {
        window.location.href = data.redirect;
      }
    } catch {
      setPasswordError("Login failed");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Auth guard
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted border-t-[#8B7355] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    if (loginMode === "password") {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-full max-w-sm p-6 border border-border rounded-lg bg-card">
            <h2 className="text-lg font-semibold mb-4">Admin Login</h2>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-red-600">{passwordError}</p>
              )}
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="w-full btn-primary py-2"
              >
                {passwordSubmitting ? "..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      );
    }
    if (loginMode === "oauth") {
      window.location.href = getLoginUrl("/admin");
      return null;
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <p className="text-lg font-medium mb-2">Admin login not configured</p>
          <p className="text-muted-foreground text-sm mb-4">
            Add <code className="bg-muted px-1 rounded">ADMIN_PASSWORD=your_password</code> to .env to enable password login.
          </p>
          <Link href="/">
            <Button variant="outline">Back to website</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <p className="text-4xl font-semibold mb-4">403</p>
          <p className="text-muted-foreground mb-6">
            You do not have permission to access the admin panel.
          </p>
          <Link href="/">
            <Button variant="outline">Back to website</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-[240px]" : "w-[60px]"
        } border-r border-border/50 bg-card flex-shrink-0 flex flex-col transition-all duration-200 relative`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border/50">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-[#1A1A18] flex items-center justify-center">
                <span className="text-white text-xs font-bold">PA</span>
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Admin
              </span>
            </div>
          ) : (
            <div className="w-7 h-7 rounded bg-[#1A1A18] flex items-center justify-center mx-auto">
              <span className="text-white text-xs font-bold">PA</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive
                      ? "bg-[#8B7355]/10 text-[#8B7355] font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* Footer */}
        <div className="p-3 space-y-2">
          <Link href="/">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer">
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              {sidebarOpen && <span>View website</span>}
            </div>
          </Link>
          {sidebarOpen && user && (
            <div className="px-3 py-2">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.email || "Admin"}
              </p>
            </div>
          )}
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground w-full"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-16 w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors z-10"
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <Menu className="h-3 w-3" />
          )}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
