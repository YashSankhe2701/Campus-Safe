"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { StatusVariant, StatusCardProps } from "@/types";

const STATUS_CONFIG: Record<
  StatusVariant,
  {
    icon: typeof CheckCircle2;
    badgeClass: string;
    label: string;
    dotColor: string;
    iconBoxClass: string;
    accentLineClass: string;
  }
> = {
  operational: {
    icon: CheckCircle2,
    badgeClass: "bg-emerald-950/60 text-emerald-300 border border-emerald-500/30",
    label: "Operational",
    dotColor: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    iconBoxClass: "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20",
    accentLineClass: "bg-emerald-500",
  },
  degraded: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-950/60 text-amber-300 border border-amber-500/30",
    label: "Not Configured",
    dotColor: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    iconBoxClass: "bg-amber-950/40 text-amber-400 border border-amber-500/20",
    accentLineClass: "bg-amber-500",
  },
  offline: {
    icon: XCircle,
    badgeClass: "bg-red-950/60 text-red-300 border border-red-500/30",
    label: "Offline",
    dotColor: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]",
    iconBoxClass: "bg-red-950/40 text-red-400 border border-red-500/20",
    accentLineClass: "bg-red-500",
  },
  loading: {
    icon: Loader2,
    badgeClass: "bg-slate-800 text-slate-300 border border-slate-700",
    label: "Checking...",
    dotColor: "bg-cyan-400",
    iconBoxClass: "bg-slate-800 text-cyan-400 border border-slate-700",
    accentLineClass: "bg-cyan-500",
  },
};

export function StatusCard({ title, status, message, details }: StatusCardProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Card className="relative overflow-hidden border border-[#263449] bg-[#111827] shadow-md transition-all hover:border-[#384c68]">
      {/* Top status accent line */}
      <div className={`absolute top-0 left-0 h-[2px] w-full ${config.accentLineClass}`} />

      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
          {title}
        </CardTitle>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${config.badgeClass}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${config.dotColor} ${
              status === "loading" ? "animate-pulse" : ""
            }`}
          />
          {config.label}
        </span>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.iconBoxClass}`}
          >
            <Icon
              className={`h-5 w-5 ${status === "loading" ? "animate-spin" : ""}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#F1F5F9]">
              {message || config.label}
            </p>
            {details && (
              <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                {details}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
