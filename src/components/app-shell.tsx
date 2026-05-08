import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffect } from "react";
import { LogOut, ClipboardList, FlaskConical, Users, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!isAuthenticated) navigate({ to: "/login", search: { redirect: loc.pathname } as any });
  }, [isAuthenticated, navigate, loc.pathname]);

  if (!isAuthenticated) return null;

  const navItems = [
    { to: "/", icon: ClipboardList, label: "Today Register" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/tests", icon: FlaskConical, label: "Test Catalog", roles: ["admin"] as const },
    { to: "/users", icon: Users, label: "Users", roles: ["admin"] as const },
  ];

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-6">
          <div className="font-semibold tracking-tight">Pathology Lab</div>
          <nav className="flex items-center gap-1 text-sm">
            {navItems
              .filter(n => !n.roles || hasRole(...n.roles))
              .map(n => {
                const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
                      active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {user?.fullName} <span className="rounded bg-secondary px-1.5 py-0.5 text-xs uppercase">{user?.role}</span>
          </span>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
