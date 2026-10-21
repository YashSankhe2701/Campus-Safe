"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Shield, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please provide your account email address.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await resetPasswordForEmail(email.trim());
      if (resetError) {
        setError(resetError.message || "Unable to send password reset email.");
      } else {
        setSubmitted(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B1120] p-4 text-[#F1F5F9] selection:bg-cyan-500/25 selection:text-cyan-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-35" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase text-[#F1F5F9]">
            CAMPUS-SAFE
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Account Security & Password Recovery
          </p>
        </div>

        {/* Card */}
        <Card className="border border-[#263449] bg-[#111827] shadow-2xl">
          <CardHeader className="border-b border-[#263449] pb-4 pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-[#F1F5F9]">
              Reset Password
            </CardTitle>
            <CardDescription className="text-xs text-[#94A3B8]">
              Enter your registered institutional email to receive a secure recovery link.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {error && (
              <div
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {submitted ? (
              <div
                className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-xs text-emerald-200"
                role="status"
              >
                <div className="flex items-center gap-2 font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Recovery Link Sent</span>
                </div>
                <p className="leading-relaxed text-emerald-200/90">
                  If an account exists for <strong>{email}</strong>, you will receive a secure password reset link shortly. Please check your inbox and spam folder.
                </p>
                <Link
                  href="/login"
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
                <div>
                  <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="forgot-email">
                    Institutional Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="name@campus.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-[#263449] bg-[#172033] px-3 py-2 text-xs text-[#F1F5F9] placeholder:text-[#526176] focus:border-cyan-400 focus:outline-none transition-colors"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs py-2.5 shadow-md transition-all disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending Link...</span>
                    </>
                  ) : (
                    <span>Send Password Reset Link</span>
                  )}
                </Button>

                <div className="mt-2 text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
