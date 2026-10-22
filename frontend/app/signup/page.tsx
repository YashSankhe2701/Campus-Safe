"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function SignUpPage() {
  const router = useRouter();
  const { user, signUp, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await signUp(email.trim(), password, fullName.trim());
      if (signUpError) {
        setError(signUpError.message || "Failed to create account.");
      } else if (data?.user && !data.session) {
        // Email confirmation is required by Supabase Auth settings
        setSuccessNotice(
          "Registration successful! A confirmation email has been sent to your address. Please verify your email before signing in."
        );
      } else {
        // Direct session created
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-35" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#F1F5F9]">
            Sentinel EvacOS
          </h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Create a New Campus Emergency Account
          </p>
        </div>

        {/* SignUp Card */}
        <Card className="border border-[#263449] bg-[#111827] shadow-2xl">
          <CardHeader className="border-b border-[#263449] pb-4 pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-[#F1F5F9]">
              Register Account
            </CardTitle>
            <CardDescription className="text-xs text-[#94A3B8]">
              Join the smart campus safety and evacuation management system.
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

            {successNotice && (
              <div
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200"
                role="status"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <p>{successNotice}</p>
                  <Link
                    href="/login"
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Go to Sign In <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {!successNotice && (
              <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3.5 text-xs">
                {/* Full Name */}
                <div>
                  <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="signup-name">
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    name="signup_fullname"
                    type="text"
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="e.g. Yash / Student Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-md border border-[#263449] bg-[#172033] px-3 py-2 text-xs text-[#F1F5F9] placeholder:text-[#526176] focus:border-cyan-400 focus:outline-none transition-colors"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="signup-email">
                    Institutional Email Address
                  </label>
                  <input
                    id="signup-email"
                    name="signup_email"
                    type="email"
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
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
                  <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="signup-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      name="signup_password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      placeholder="At least 6 characters"
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

                {/* Confirm Password */}
                <div>
                  <label className="mb-1.5 block font-semibold text-[#F1F5F9]" htmlFor="signup-confirm-password">
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm-password"
                    name="signup_confirm_password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-md border border-[#263449] bg-[#172033] px-3 py-2 text-xs text-[#F1F5F9] placeholder:text-[#526176] focus:border-cyan-400 focus:outline-none transition-colors"
                  />
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
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 border-t border-[#263449] pt-4 text-center text-xs text-[#94A3B8]">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
