"use client";

import { useState } from "react";
import { useSystemStatus } from "@/hooks/use-system-status";
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
  Layers,
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
  const { backend, database, info, refresh } = useSystemStatus();
  const [activeTab, setActiveTab] = useState<"map" | "system">("map");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-emerald-500/[0.07] via-teal-500/[0.05] to-transparent blur-3xl" />
        <div className="absolute -right-1/4 top-1/3 h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-blue-500/[0.07] via-cyan-500/[0.05] to-transparent blur-3xl" />
        <div className="absolute -bottom-1/4 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-violet-500/[0.05] via-purple-500/[0.03] to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">CAMPUS-SAFE</h1>
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Emergency Management
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-muted/30 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "map"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              <span>Campus Map</span>
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] bg-emerald-600/30 text-emerald-200">
                Phase 6
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("system")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "system"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>System Health</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {info && (
              <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
                v{info.version}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="gap-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {activeTab === "map" ? (
            /* PHASE 6: INTERACTIVE CAMPUS MAP */
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Interactive Campus Map</h2>
                  <p className="text-xs text-muted-foreground">
                    Schematic campus graph visualization, routing engine, and exit selection.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                    ● Graph APIs Active
                  </Badge>
                </div>
              </div>

              <CampusMap />
            </div>
          ) : (
            /* SYSTEM STATUS & ARCHITECTURE (FOUNDATION) */
            <div className="flex flex-col gap-12">
              {/* Hero Section */}
              <section className="text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Foundation Phase — v0.1.0
                </div>

                <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
                    CAMPUS
                  </span>
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                    -SAFE
                  </span>
                </h2>

                <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  AI-powered emergency response and dynamic evacuation management
                  for smart campuses. Real-time monitoring, intelligent routing, and
                  predictive analytics for safer educational environments.
                </p>
              </section>

              {/* System Status Section */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    System Status
                  </h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <StatusCard
                    title="Backend Status"
                    status={backend.status}
                    message={
                      backend.data
                        ? `${backend.data.service} — v${backend.data.version}`
                        : backend.error || "Checking connection..."
                    }
                    details={
                      backend.data
                        ? "FastAPI server responding"
                        : backend.error
                        ? "Cannot reach the API server"
                        : undefined
                    }
                  />
                  <StatusCard
                    title="Database Status"
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
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    Architecture
                  </h3>
                </div>

                <Card className="border border-border/40 bg-card/30 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="grid gap-6 sm:grid-cols-3">
                      {/* Frontend */}
                      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-background/40 p-6 text-center transition-all hover:border-emerald-500/30 hover:bg-background/60">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 text-blue-400">
                          <Server className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold">Next.js Frontend</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            TypeScript · App Router · Tailwind
                          </p>
                        </div>
                      </div>

                      {/* Backend */}
                      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-background/40 p-6 text-center transition-all hover:border-emerald-500/30 hover:bg-background/60">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 text-emerald-400">
                          <Zap className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold">FastAPI Backend</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Python · Pydantic · REST API
                          </p>
                        </div>
                      </div>

                      {/* Database */}
                      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-background/40 p-6 text-center transition-all hover:border-emerald-500/30 hover:bg-background/60">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 text-violet-400">
                          <Database className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold">Supabase</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            PostgreSQL · Realtime · Auth
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground/50">
                      <span>Frontend</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>API</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>Database</span>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Upcoming Modules */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    Project Roadmap
                  </h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FUTURE_MODULES.map((module) => {
                    const Icon = module.icon;
                    return (
                      <Card
                        key={module.title}
                        className="group border border-border/30 bg-card/20 backdrop-blur-sm transition-all duration-300 hover:bg-card/40 hover:shadow-md"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-emerald-400" />
                              <CardTitle className="text-sm">{module.title}</CardTitle>
                            </div>
                            <Badge
                              variant="outline"
                              className="text-[9px] font-semibold tracking-wider opacity-50"
                            >
                              Phase {module.phase}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription className="text-xs leading-relaxed">
                            {module.description}
                          </CardDescription>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Quick Links */}
              {info && (
                <section>
                  <Card className="border border-border/30 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
                      <div>
                        <p className="font-semibold">
                          {info.project} API Documentation
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {info.environment} environment · {info.api_status}
                        </p>
                      </div>
                      {API_BASE_URL && (
                        <a
                          href={`${API_BASE_URL}/docs`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" className="gap-2">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open API Docs
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/30 bg-background/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <p className="text-xs text-muted-foreground/60">
            CAMPUS-SAFE · Phase 6 Interactive Campus Map
          </p>
          <p className="text-xs text-muted-foreground/40">
            Next.js App Router · FastAPI · Supabase
          </p>
        </div>
      </footer>
    </div>
  );
}
