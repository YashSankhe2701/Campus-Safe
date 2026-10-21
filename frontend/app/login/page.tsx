"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter both email address and password.");
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        setError(signInError.message || "Failed to sign in. Please verify your credentials.");
      } else {
        router.push("/");
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
      {/* Background CAD Grid Accent */}
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
            Smart Campus Emergency Navigation & Evacuation OS
          </p>
        </div>

        {/* Login Card */}
        <Card className="border border-[#263449] bg-[#111827] shadow-2xl">
          <CardHeader className="border-b border-[#263449] pb-4 pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-[#F1F5F9]">
              Sign In to Your Account
            </CardTitle>
            <CardDescription className="text-xs text-[#94A3B8]">
              Enter your authorized institutional email and password to access the campus emergency map.
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

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
              {/* Email */}
              <div>
                <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="login-email">
                  Email Address
                </label>
                <input
                  id="login-email"
                  name="login_email"
                  type="email"
                  required
                  autoComplete="email"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  placeholder="name@campus.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-[#263449] bg-[#172033] px-3 py-2 text-xs text-[#F1F5F9] placeholder:text-[#526176] focus:border-cyan-400 focus:outline-none transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="font-semibold text-[#F1F5F9]" htmlFor="login-password">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    name="login_password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-[#263449] bg-[#172033] px-3 py-2 pr-9 text-xs text-[#F1F5F9] placeholder:text-[#526176] focus:border-cyan-400 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="mt-2 w-full gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs py-2.5 shadow-md transition-all disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-[#263449] pt-4 text-center text-xs text-[#94A3B8]">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Demo Credentials Hint */}
        <div className="mt-4 rounded-lg border border-[#263449]/70 bg-[#111827]/60 p-3 text-center text-[11px] text-[#94A3B8]">
          <span className="font-semibold text-cyan-400">First time here?</span> Create a new account with your email, or sign in with your Supabase credentials.
        </div>
      </div>
    </div>
  );
}
