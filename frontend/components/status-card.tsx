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
    badgeClass: string;
    label: string;
    dotColor: string;
    iconBoxClass: string;
    accentLineClass: string;
  }
> = {
  operational: {
    icon: CheckCircle2,
    badgeClass: "bg-[#E6EFE8] text-[#244f32] border border-[#3C6849]/25",
    label: "Operational",
    dotColor: "bg-[#3C6849]",
    iconBoxClass: "bg-[#E6EFE8] text-[#3C6849]",
    accentLineClass: "bg-[#3C6849]",
  },
  degraded: {
    icon: AlertTriangle,
    badgeClass: "bg-[#FAF2E4] text-[#7A4F13] border border-[#B77A26]/30",
    label: "Not Configured",
    dotColor: "bg-[#B77A26]",
    iconBoxClass: "bg-[#FAF2E4] text-[#B77A26]",
    accentLineClass: "bg-[#B77A26]",
  },
  offline: {
    icon: XCircle,
    badgeClass: "bg-[#F9E8E7] text-[#BA1A1A] border border-[#BA1A1A]/30",
    label: "Offline",
    dotColor: "bg-[#BA1A1A]",
    iconBoxClass: "bg-[#F9E8E7] text-[#BA1A1A]",
    accentLineClass: "bg-[#BA1A1A]",
  },
  loading: {
    icon: Loader2,
    badgeClass: "bg-[#EEEDE5] text-[#46483E] border border-[#DFDFD4]",
    label: "Checking...",
    dotColor: "bg-[#57603A]",
    iconBoxClass: "bg-[#EEEDE5] text-[#57603A]",
    accentLineClass: "bg-[#57603A]",
  },
};

export function StatusCard({ title, status, message, details }: StatusCardProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Card className="relative overflow-hidden border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
      {/* Top status accent line */}
      <div className={`absolute top-0 left-0 h-[2px] w-full ${config.accentLineClass}`} />

      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#686B60]">
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
            <p className="text-sm font-semibold text-[#1A1D14]">
              {message || config.label}
            </p>
            {details && (
              <p className="mt-0.5 truncate text-xs text-[#686B60]">
                {details}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
