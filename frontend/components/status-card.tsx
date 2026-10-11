"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    label: string;
    dotColor: string;
  }
> = {
  operational: {
    icon: CheckCircle2,
    badgeVariant: "default",
    label: "Operational",
    dotColor: "bg-emerald-400",
  },
  degraded: {
    icon: AlertTriangle,
    badgeVariant: "outline",
    label: "Not Configured",
    dotColor: "bg-amber-400",
  },
  offline: {
    icon: XCircle,
    badgeVariant: "destructive",
    label: "Offline",
    dotColor: "bg-red-400",
  },
  loading: {
    icon: Loader2,
    badgeVariant: "secondary",
    label: "Checking...",
    dotColor: "bg-blue-400",
  },
};

export function StatusCard({ title, status, message, details }: StatusCardProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Card className="relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
      {/* Animated top border accent */}
      <div
        className={`absolute top-0 left-0 h-[2px] w-full transition-all duration-500 ${
          status === "operational"
            ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400"
            : status === "degraded"
            ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400"
            : status === "offline"
            ? "bg-gradient-to-r from-red-500 via-red-400 to-rose-400"
            : "bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400 animate-pulse"
        }`}
      />

      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Badge variant={config.badgeVariant} className="text-[10px] font-semibold tracking-wide uppercase">
          <span
            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${config.dotColor} ${
              status === "loading" ? "animate-pulse" : ""
            }`}
          />
          {config.label}
        </Badge>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
              status === "operational"
                ? "bg-emerald-500/10 text-emerald-400"
                : status === "degraded"
                ? "bg-amber-500/10 text-amber-400"
                : status === "offline"
                ? "bg-red-500/10 text-red-400"
                : "bg-blue-500/10 text-blue-400"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${status === "loading" ? "animate-spin" : ""}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {message || config.label}
            </p>
            {details && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {details}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
