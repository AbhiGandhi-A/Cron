"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";
import {
  ZapIcon,
  DashboardIcon,
  UsersIcon,
  MailIcon,
  ActivityIcon,
  HealthIcon,
  SettingsIcon,
} from "@/components/admin/AdminIcons";

interface LayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("adminAuthToken");
      if (!token) {
        if (pathname === "/admin/login") {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
        router.push("/admin/login");
        return;
      }

      const res = await fetch("/api/admin/auth", {
        headers: { Authorization: token },
      });

      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem("adminAuthToken");
        if (pathname === "/admin/login") {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
        router.push("/admin/login");
      }
    } catch {
      localStorage.removeItem("adminAuthToken");
      if (pathname === "/admin/login") {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuthToken");
    router.push("/admin/login");
  };

  const isLoginPage = pathname === "/admin/login";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Loading Admin Panel...
        </div>
      </div>
    );
  }

  if (isLoginPage) {
    return children;
  }

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    { label: "Dashboard", href: "/admin", Icon: DashboardIcon },
    { label: "Users", href: "/admin/users", Icon: UsersIcon },
    { label: "Temp Mail", href: "/admin/temp-mail", Icon: MailIcon },
    { label: "Activity Log", href: "/admin/activity", Icon: ActivityIcon },
    { label: "System Health", href: "/admin/health", Icon: HealthIcon },
    { label: "Settings", href: "/admin/settings", Icon: SettingsIcon },
  ];

  const currentNav = navItems.find((n) => n.href === pathname)?.label || "Admin";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } bg-white border-r border-slate-200 transition-all duration-200 flex flex-col z-20 shadow-sm`}
      >
        {/* Brand */}
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              <ZapIcon className="w-5 h-5" />
            </div>
            {sidebarOpen && (
              <div className="truncate">
                <div className="font-bold text-slate-900 leading-tight">CronJob.io</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Admin SaaS</div>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User / Collapse footer */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <span>{sidebarOpen ? "← Collapse Sidebar" : "→"}</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{currentNav}</h2>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Admin Portal
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Session Active
            </div>
            <button
              onClick={handleLogout}
              className="px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors text-xs font-semibold shadow-xs"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto bg-slate-50/70 p-6 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

