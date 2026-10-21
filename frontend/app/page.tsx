"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useAuth } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/lib/api";
import { StatusCard } from "@/components/status-card";
import { CampusMap } from "@/components/map/campus-map";
import {
  Shield,
  Activity,
  Database,
  Server,
  Radio,
  Map as MapIcon,
  Users,
  Zap,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Building2,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FUTURE_MODULES = [
  {
    icon: MapIcon,
    title: "Campus Graph",
    description: "Digital campus model with buildings, rooms, and corridors",
    phase: 2,
  },
  {
    icon: Zap,
    title: "Smart Routing",
    description: "A* and Dijkstra pathfinding algorithms",
    phase: 3,
  },
  {
    icon: Radio,
    title: "Emergency Engine",
    description: "Dynamic emergency detection and response",
    phase: 4,
  },
  {
    icon: Users,
    title: "Crowd Analysis",
    description: "Real-time crowd density and congestion modeling",
    phase: 5,
  },
  {
    icon: Activity,
    title: "ML Prediction",
    description: "Machine learning evacuation time prediction",
    phase: 7,
  },
  {
    icon: Shield,
    title: "Command Center",
    description: "Real-time emergency command dashboard",
    phase: 10,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { backend, database, info, refresh } = useSystemStatus();
  const [activeTab, setActiveTab] = useState<"map" | "system">("map");
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Authentication Gate: redirect to /login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err) {
      console.error("Sign out error:", err);
      setSigningOut(false);
    }
  };

  // While checking initial auth state, show dark splash spinner
  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1120] text-[#F1F5F9]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] mb-4">
          <Shield className="h-6 w-6" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400 mb-2" />
        <p className="text-xs text-[#94A3B8] font-mono">Verifying authorization...</p>
      </div>
    );
  }

  // If not authenticated, prevent flash while redirect takes effect
  if (!user) {
    return null;
  }

  const isBackendOnline = backend.status === "operational";
  const isDbOnline = database.status === "operational";
  const userInitials =
    user.user_metadata?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    user.email?.slice(0, 2).toUpperCase() ||
    "CS";

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0B1120] text-[#F1F5F9]">
      {/* Dark Architectural Header */}
      <header className="sticky top-0 z-50 bg-[#0B1120]/95 backdrop-blur-md border-b border-[#263449]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight uppercase text-[#F1F5F9]">
                  CAMPUS-SAFE
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                  Operations Console
                </span>
              </div>
              <span className="text-[11px] text-[#94A3B8] font-normal leading-tight hidden sm:inline">
                Smart Campus Emergency Navigation
              </span>
            </div>

            {/* Live Backend Health Pill (Based on real health check) */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                isBackendOnline
                  ? "bg-emerald-950/50 border-emerald-500/30 text-emerald-300"
                  : backend.status === "loading"
                  ? "bg-slate-900 border-slate-700 text-slate-300"
                  : "bg-red-950/50 border-red-500/30 text-red-300"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isBackendOnline
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : backend.status === "loading"
                    ? "bg-cyan-400 animate-pulse"
                    : "bg-red-400 animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.8)]"
                }`}
              />
              <span>
                {isBackendOnline
                  ? "Graph Engine: Connected"
                  : backend.status === "loading"
                  ? "Connecting API..."
                  : "Graph Engine: Disconnected"}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 h-16">
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-1.5 px-3.5 h-full text-xs font-semibold transition-all border-b-2 ${
                activeTab === "map"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/30"
                  : "border-transparent text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#111827]/60"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              <span>Campus Map & Routing</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("system")}
              className={`flex items-center gap-1.5 px-3.5 h-full text-xs font-semibold transition-all border-b-2 ${
                activeTab === "system"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-950/30"
                  : "border-transparent text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#111827]/60"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>System Health</span>
            </button>
          </nav>

          {/* User Profile, Campus Selector & Sign Out */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 bg-[#172033] border border-[#263449] rounded-md px-2.5 py-1 text-xs text-[#F1F5F9] font-medium">
              <Building2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Demo Campus</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="h-8 gap-1.5 text-xs border-[#263449] bg-[#111827] hover:bg-[#172033] text-[#F1F5F9]"
              title="Refresh connection status"
            >
              <RefreshCw className="h-3 w-3 text-cyan-400" />
              <span className="hidden sm:inline">Sync</span>
            </Button>

            {/* User Profile Pill & Sign Out */}
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-[#263449]">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-950 border border-cyan-500/40 text-[10px] font-bold text-cyan-300"
                title={user.email}
              >
                {userInitials}
              </div>
              <span className="hidden xl:inline text-xs font-mono text-[#F1F5F9] max-w-[120px] truncate">
                {user.email?.split("@")[0]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-8 px-2 text-xs text-[#94A3B8] hover:text-red-400 hover:bg-red-950/30 transition-colors"
                title="Sign out of account"
              >
                {signingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline ml-1">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Operational Sub-Header & Global Context Bar */}
      <div className="w-full bg-[#111827] border-b border-[#263449] px-4 sm:px-6 py-2.5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isBackendOnline
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                  : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
              }`}
            />
            <span className="font-semibold text-[#F1F5F9]">Emergency Operations Center</span>
            <span className="text-[#263449]">|</span>
            <span className="text-[#94A3B8]">
              Authoritative Campus Topology: 21 Nodes · 21 Edges · 3 Exits · 1 Assembly Point
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-[#94A3B8]">
            <span>
              Database:{" "}
              {isDbOnline ? (
                <span className="text-emerald-400 font-semibold">PostgreSQL Connected</span>
              ) : database.status === "loading" ? (
                <span className="text-cyan-400">Connecting...</span>
              ) : (
                <span className="text-amber-400">Offline / Standalone</span>
              )}
            </span>
            {info && (
              <>
                <span className="text-[#263449]">|</span>
                <span>API v{info.version}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {activeTab === "map" ? (
          <CampusMap />
        ) : (
          <div className="space-y-8">
            {/* System Overview Hero Section */}
            <section className="rounded-xl border border-[#263449] bg-[#111827] p-8 text-center shadow-lg">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.25)]">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-[#F1F5F9] sm:text-3xl">
                CAMPUS-SAFE Emergency OS
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
                AI-assisted smart campus emergency operations and evacuation management platform.
                Combines authoritative campus graph topology, safety-constrained pathfinding,
                and machine-learning travel-time estimations.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="rounded bg-[#172033] border border-[#263449] px-2.5 py-1 font-medium text-[#F1F5F9]">
                  21 Graph Nodes
                </span>
                <span className="rounded bg-[#172033] border border-[#263449] px-2.5 py-1 font-medium text-[#F1F5F9]">
                  21 Authoritative Edges
                </span>
                <span className="rounded bg-[#172033] border border-[#263449] px-2.5 py-1 font-medium text-[#F1F5F9]">
                  Ground & 1st Floor Topology
                </span>
                <span className="rounded bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 font-medium text-emerald-300">
                  Dijkstra · A* · Hazard-Aware Routing
                </span>
              </div>
            </section>

            {/* System Status Section */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  Core Service Telemetry
                </h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <StatusCard
                  title="FastAPI Graph Engine"
                  status={backend.status}
                  message={
                    backend.data
                      ? `${backend.data.service} — v${backend.data.version}`
                      : backend.error || "Checking connection..."
                  }
                  details={
                    backend.data
                      ? "FastAPI server active with NetworkX graph routing"
                      : backend.error
                      ? "Cannot reach the API server"
                      : undefined
                  }
                />
                <StatusCard
                  title="Supabase Database"
                  status={database.status}
                  message={
                    database.data
                      ? `${database.data.database} — ${database.data.status}`
                      : database.error || "Checking connection..."
                  }
                  details={
                    database.data?.message ||
                    (database.data?.status === "ok"
                      ? "Supabase PostgreSQL connected"
                      : database.error
                      ? "Cannot reach the database"
                      : undefined)
                  }
                />
              </div>
            </section>

            {/* Architecture Overview */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  System Architecture
                </h3>
              </div>

              <Card className="border border-[#263449] bg-[#111827] shadow-lg">
                <CardContent className="p-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Frontend */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#263449] bg-[#172033] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
                        <Server className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#F1F5F9]">Next.js Frontend</p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          TypeScript · App Router · Tailwind CSS
                        </p>
                      </div>
                    </div>

                    {/* Backend */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#263449] bg-[#172033] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#F1F5F9]">FastAPI Backend</p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          Python · Pydantic · NetworkX Graph
                        </p>
                      </div>
                    </div>

                    {/* Database */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#263449] bg-[#172033] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-950/60 border border-amber-500/30 text-amber-400">
                        <Database className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#F1F5F9]">Supabase PostgreSQL</p>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          PostgreSQL · Realtime Engine · Auth
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-[#94A3B8]">
                    <span>Frontend Client</span>
                    <ArrowRight className="h-3 w-3 text-cyan-400" />
                    <span>FastAPI REST</span>
                    <ArrowRight className="h-3 w-3 text-cyan-400" />
                    <span>Supabase DB</span>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Upcoming Roadmap Modules */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  Project Roadmap & Functional Modules
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FUTURE_MODULES.map((module) => {
                  const Icon = module.icon;
                  return (
                    <Card
                      key={module.title}
                      className="border border-[#263449] bg-[#111827] shadow-md transition-all hover:border-[#384c68]"
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-cyan-400" />
                            <CardTitle className="text-sm font-semibold text-[#F1F5F9]">
                              {module.title}
                            </CardTitle>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-[#263449] bg-[#172033] text-[10px] font-semibold text-[#94A3B8]"
                          >
                            Phase {module.phase}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-1">
                        <CardDescription className="text-xs leading-relaxed text-[#94A3B8]">
                          {module.description}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* API Documentation Link */}
            {info && (
              <section>
                <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-[#263449] bg-[#111827] p-6 sm:flex-row shadow-lg">
                  <div>
                    <p className="text-sm font-semibold text-[#F1F5F9]">
                      {info.project} API Documentation (Swagger / OpenAPI)
                    </p>
                    <p className="mt-0.5 text-xs text-[#94A3B8]">
                      {info.environment} environment · {info.api_status}
                    </p>
                  </div>
                  {API_BASE_URL && (
                    <a
                      href={`${API_BASE_URL}/docs`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 border-[#263449] bg-[#172033] text-xs font-medium text-[#F1F5F9] hover:bg-[#1f2b45]"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
                        Explore API Docs
                      </Button>
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Dark Architectural Footer */}
      <footer className="border-t border-[#263449] bg-[#0B1120]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#F1F5F9]">CAMPUS-SAFE</span>
            <span className="text-[#263449]">|</span>
            <span className="text-xs text-[#94A3B8]">
              Smart Campus Emergency Navigation & Evacuation Operations
            </span>
          </div>
          <p className="text-xs text-[#94A3B8]">
            Next.js App Router · FastAPI · NetworkX MultiDiGraph · Supabase Auth & PostgreSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
