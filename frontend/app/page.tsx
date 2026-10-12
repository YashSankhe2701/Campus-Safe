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
  Building2,
  CheckCircle2,
  AlertTriangle,
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
    <div className="relative flex min-h-screen flex-col bg-[#F5F4EE] text-[#1A1D14]">
      {/* Stitch Architectural Header */}
      <header className="sticky top-0 z-50 bg-[#F5F4EE]/95 backdrop-blur-md border-b border-[#DFDFD4]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#57603A] text-white shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight uppercase text-[#1A1D14]">
                  CAMPUS-SAFE
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#EEEDE5] text-[#46483E] border border-[#C7C7BA]">
                  Enterprise Safety OS
                </span>
              </div>
            </div>

            {/* Live Backend & Graph Engine Health Status Pill */}
            <div className="hidden md:flex items-center gap-1.5 bg-[#E6EFE8] border border-[#3C6849]/25 px-2.5 py-0.5 rounded-full">
              <span
                className={`w-2 h-2 rounded-full ${
                  backend.status === "operational" ? "bg-[#3C6849]" : "bg-[#BA1A1A] animate-pulse"
                }`}
              />
              <span className="text-[11px] font-medium text-[#244f32]">
                {backend.status === "operational"
                  ? "FastAPI & Graph Engine: Operational"
                  : "Graph Engine: Disconnected"}
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 h-16">
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-1.5 px-3.5 h-full text-xs font-semibold transition-colors border-b-2 ${
                activeTab === "map"
                  ? "border-[#57603A] bg-[#EEEDE5]/50 text-[#1A1D14]"
                  : "border-transparent text-[#686B60] hover:text-[#1A1D14]"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              <span>Live Sector Map & Routing</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("system")}
              className={`flex items-center gap-1.5 px-3.5 h-full text-xs font-semibold transition-colors border-b-2 ${
                activeTab === "system"
                  ? "border-[#57603A] bg-[#EEEDE5]/50 text-[#1A1D14]"
                  : "border-transparent text-[#686B60] hover:text-[#1A1D14]"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>System Health & Diagnostics</span>
            </button>
          </nav>

          {/* Context, Campus Selector & Refresh */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 bg-[#EEEDE5] border border-[#DFDFD4] rounded px-2.5 py-1 text-xs text-[#1A1D14] font-medium">
              <Building2 className="h-3.5 w-3.5 text-[#686B60]" />
              <span>Demo Campus</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="h-8 gap-1.5 text-xs border-[#DFDFD4] bg-[#FFFFFF] hover:bg-[#EEEDE5] text-[#1A1D14]"
            >
              <RefreshCw className="h-3 w-3 text-[#686B60]" />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Operational Sub-Header & Global Context Bar */}
      <div className="w-full bg-[#FAF9F5] border-b border-[#DFDFD4] px-4 sm:px-6 py-2.5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#3C6849]" />
            <span className="font-semibold text-[#1A1D14]">Central Operations Console</span>
            <span className="text-[#C7C7BA]">·</span>
            <span className="text-[#686B60]">Authoritative Topology: 21 Nodes · 21 Edges · 3 Exits · 1 Assembly Point</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-[#686B60]">
            <span>Database: {database.status === "operational" ? "PostgreSQL Connected" : "Connecting..."}</span>
            {info && (
              <>
                <span className="text-[#C7C7BA]">·</span>
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
            <section className="rounded-xl border border-[#DFDFD4] bg-[#FFFFFF] p-8 text-center shadow-xs">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEEDE5] text-[#57603A]">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-[#1A1D14] sm:text-3xl">
                CAMPUS-SAFE Enterprise Safety OS
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[#686B60]">
                AI-assisted smart campus emergency operations and evacuation management platform.
                Combines authoritative campus graph topology, safety-constrained pathfinding,
                and machine-learning travel-time estimations.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="rounded bg-[#EEEDE5] px-2.5 py-1 font-medium text-[#46483E]">
                  21 Graph Nodes
                </span>
                <span className="rounded bg-[#EEEDE5] px-2.5 py-1 font-medium text-[#46483E]">
                  21 Authoritative Edges
                </span>
                <span className="rounded bg-[#EEEDE5] px-2.5 py-1 font-medium text-[#46483E]">
                  Ground & 1st Floor Topology
                </span>
                <span className="rounded bg-[#E6EFE8] px-2.5 py-1 font-medium text-[#244f32]">
                  Dijkstra · A* · Hazard-Aware Routing
                </span>
              </div>
            </section>

            {/* System Status Section */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Server className="h-4 w-4 text-[#686B60]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#686B60]">
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
                <Activity className="h-4 w-4 text-[#686B60]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#686B60]">
                  System Architecture
                </h3>
              </div>

              <Card className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
                <CardContent className="p-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Frontend */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EEEDE5] text-[#57603A]">
                        <Server className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1D14]">Next.js Frontend</p>
                        <p className="mt-1 text-xs text-[#686B60]">
                          TypeScript · App Router · Tailwind CSS
                        </p>
                      </div>
                    </div>

                    {/* Backend */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E6EFE8] text-[#3C6849]">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1D14]">FastAPI Backend</p>
                        <p className="mt-1 text-xs text-[#686B60]">
                          Python · Pydantic · NetworkX Graph
                        </p>
                      </div>
                    </div>

                    {/* Database */}
                    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-5 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FAF2E4] text-[#B77A26]">
                        <Database className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1D14]">Supabase PostgreSQL</p>
                        <p className="mt-1 text-xs text-[#686B60]">
                          PostgreSQL · Realtime Engine · Auth
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-[#686B60]">
                    <span>Frontend Client</span>
                    <ArrowRight className="h-3 w-3 text-[#C7C7BA]" />
                    <span>FastAPI REST & WebSocket</span>
                    <ArrowRight className="h-3 w-3 text-[#C7C7BA]" />
                    <span>Supabase DB</span>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Upcoming Roadmap Modules */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#686B60]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#686B60]">
                  Project Roadmap & Functional Modules
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FUTURE_MODULES.map((module) => {
                  const Icon = module.icon;
                  return (
                    <Card
                      key={module.title}
                      className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs transition-shadow hover:shadow-sm"
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-[#57603A]" />
                            <CardTitle className="text-sm font-semibold text-[#1A1D14]">
                              {module.title}
                            </CardTitle>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-[#DFDFD4] bg-[#EEEDE5] text-[10px] font-semibold text-[#46483E]"
                          >
                            Phase {module.phase}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-1">
                        <CardDescription className="text-xs leading-relaxed text-[#686B60]">
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
                <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-[#DFDFD4] bg-[#FFFFFF] p-6 sm:flex-row shadow-xs">
                  <div>
                    <p className="text-sm font-semibold text-[#1A1D14]">
                      {info.project} API Documentation (Swagger / OpenAPI)
                    </p>
                    <p className="mt-0.5 text-xs text-[#686B60]">
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
                        className="gap-2 border-[#DFDFD4] bg-[#FFFFFF] text-xs font-medium text-[#1A1D14] hover:bg-[#EEEDE5]"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-[#57603A]" />
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

      {/* Stitch Architectural Footer */}
      <footer className="border-t border-[#DFDFD4] bg-[#FAF9F5]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#1A1D14]">CAMPUS-SAFE</span>
            <span className="text-[#C7C7BA]">·</span>
            <span className="text-xs text-[#686B60]">
              Enterprise Safety OS & Intelligent Campus Evacuation System
            </span>
          </div>
          <p className="text-xs text-[#686B60]">
            Next.js 15 App Router · FastAPI · NetworkX · Supabase PostgreSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
