import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { BFCLLogo } from "@/components/BFCLLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { completePasswordReset, getCurrentSession } from "@/lib/auth";

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checkingLink, setCheckingLink] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const hasRecoveryHash = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.hash.includes("type=recovery");
  }, []);

  useEffect(() => {
    getCurrentSession()
      .then(({ data }) => {
        setRecoveryReady(Boolean(data.session) || hasRecoveryHash);
      })
      .finally(() => setCheckingLink(false));
  }, [hasRecoveryHash]);

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setSubmitting(true);
    const { error } = await completePasswordReset(password);
    setSubmitting(false);

    if (error) {
      toast({ title: "Password reset failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Password updated", description: "Sign in with your new password." });
    navigate("/login", { replace: true });
  });

  if (checkingLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verifying secure reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-noise flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-lg border-border bg-card/96 shadow-panel backdrop-blur">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <BFCLLogo className="w-40" />
            <div className="rounded-md border border-border bg-panel p-3 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Credential recovery</p>
            <CardTitle className="mt-3 text-3xl">Reset employee password</CardTitle>
            <CardDescription className="mt-2 max-w-md text-sm leading-6">
              Set a new password for your SteelFlow ERP employee account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {recoveryReady ? (
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-5">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input {...field} type={showPassword ? "text" : "password"} className="h-12 bg-panel pl-10 pr-11" />
                          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((value) => !value)}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input {...field} type={showConfirmPassword ? "text" : "password"} className="h-12 bg-panel pl-10 pr-11" />
                          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirmPassword((value) => !value)}>
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="h-12 w-full gap-2 text-base" disabled={submitting}>
                  {submitting ? "Updating password…" : "Save new password"}
                  {!submitting && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
            </Form>
          ) : (
            <div className="space-y-4 rounded-md border border-border bg-panel p-5 text-sm text-muted-foreground">
              <p>This reset link is missing or has expired.</p>
              <Button asChild variant="outline">
                <Link to="/login">Return to sign in</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
