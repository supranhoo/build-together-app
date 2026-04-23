import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Eye, EyeOff, Factory, Loader2, Mail, Lock, UserRound } from "lucide-react";
import heroImage from "@/assets/steel-plant-hero.jpg";
import { BFCLLogo } from "@/components/BFCLLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRememberPreference, setRememberPreference } from "@/lib/auth-storage";
import { requestPasswordReset } from "@/lib/auth";
import { cn } from "@/lib/utils";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid work email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your full name").max(80, "Name is too long"),
  email: z.string().trim().email("Enter a valid work email"),
  department: z.string().trim().min(2, "Enter your department").max(80, "Department is too long"),
  jobTitle: z.string().trim().min(2, "Enter your role title").max(80, "Job title is too long"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid work email"),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

const highlights = [
  "Live floor visibility for plant teams",
  "Authenticated employee access with profile records",
  "Prepared workspaces for inventory, production, and reports",
];

const RESET_COOLDOWN_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { session, signIn, signUp } = useAuth();
  const [activeTab, setActiveTab] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(getRememberPreference());
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [lastResetRequest, setLastResetRequest] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname || "/portal";
  }, [location.state]);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", department: "", jobTitle: "", password: "" },
  });

  const forgotPasswordForm = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = window.setTimeout(() => setCooldownRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownRemaining]);

  if (session) {
    return <Navigate to={nextPath} replace />;
  }

  const handleSignIn = signInForm.handleSubmit(async (values) => {
    setLoading(true);
    setRememberPreference(rememberMe);
    const { error } = await signIn(values.email, values.password);
    setLoading(false);

    if (error) {
      toast({ title: "Sign-in failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Access granted", description: "Welcome back to the plant portal." });
    navigate(nextPath, { replace: true });
  });

  const handleSignUp = signUpForm.handleSubmit(async (values) => {
    const parsedValues = signUpSchema.parse(values);
    setLoading(true);
    const { error } = await signUp({
      displayName: parsedValues.displayName,
      email: parsedValues.email,
      department: parsedValues.department,
      jobTitle: parsedValues.jobTitle,
      password: parsedValues.password,
    });
    setLoading(false);

    if (error) {
      toast({ title: "Account setup failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Account created",
      description: "Check your inbox to confirm access, then sign in to the employee portal.",
    });
    signUpForm.reset();
    setActiveTab("signin");
  });

  const handleForgotPassword = forgotPasswordForm.handleSubmit(async ({ email }) => {
    const now = Date.now();
    const secondsSinceLast = (now - lastResetRequest) / 1000;

    if (lastResetRequest && secondsSinceLast < RESET_COOLDOWN_SECONDS) {
      const remaining = Math.ceil(RESET_COOLDOWN_SECONDS - secondsSinceLast);
      setCooldownRemaining(remaining);
      forgotPasswordForm.setError("email", {
        type: "manual",
        message: `Please wait ${remaining} seconds before requesting another reset.`,
      });
      return;
    }

    setForgotLoading(true);
    const { error } = await requestPasswordReset(email);
    setForgotLoading(false);

    if (error) {
      toast({ title: "Reset request failed", description: error.message, variant: "destructive" });
      return;
    }

    setLastResetRequest(now);
    setCooldownRemaining(RESET_COOLDOWN_SECONDS);
    forgotPasswordForm.reset({ email: "" });
    setForgotOpen(false);
    toast({
      title: "Reset email sent",
      description: "Check your inbox for the secure password reset link.",
    });
  });

  const forgotError = forgotPasswordForm.formState.errors.email?.message;

  return (
    <>
      <div className="min-h-screen bg-background lg:flex">
        <section className="relative hidden overflow-hidden lg:flex lg:w-1/2 xl:w-3/5">
          <img
            src={heroImage}
            alt="Steel plant furnace line with control tower"
            className="absolute inset-0 h-full w-full object-cover"
            width={1920}
            height={1080}
          />
          <div className="absolute inset-0 bg-hero-overlay" />
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative flex h-full w-full flex-col justify-between px-12 py-10 xl:px-16">
            <div className="flex items-center justify-between">
              <BFCLLogo className="w-48" theme="dark" />
              <div className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/75 backdrop-blur-sm">
                Employee portal
              </div>
            </div>

            <div className="max-w-2xl pb-10">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Industrial enterprise access</p>
              <h1 className="mt-5 max-w-3xl text-6xl font-semibold leading-[0.92] text-white text-balance">
                Plant intelligence from furnace floor to management report.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/76">
                SteelFlow ERP gives BFCL teams a secure front door for operating inventory, production, and reporting with the discipline of a steel plant control room.
              </p>
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {highlights.map((item) => (
                  <div key={item} className="rounded-md border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-white/84 backdrop-blur-sm">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
          <div className="absolute inset-0 lg:hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
          </div>

          <div className="relative z-10 w-full max-w-md">
            <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
              <BFCLLogo className="w-40" />
            </div>

            <div className="mb-6 hidden text-center lg:block">
              <h1 className="text-3xl font-semibold leading-tight text-foreground">Plant access with the same operational shell.</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Sign in or request access for inventory, production, and reporting workflows.
              </p>
            </div>

            <Card className="relative overflow-hidden border-border/50 bg-card/80 shadow-panel backdrop-blur-xl">
              <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-secondary/15 blur-3xl" />

              <CardHeader className="relative pb-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-md border border-border bg-panel p-3 text-primary">
                    <Factory className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-semibold">Welcome back</CardTitle>
                    <CardDescription className="text-left">SteelFlow ERP</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid h-12 w-full grid-cols-2 bg-panel">
                    <TabsTrigger value="signin">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Request access</TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="mt-6 space-y-6">
                    <Form {...signInForm}>
                      <form onSubmit={handleSignIn} className="space-y-5">
                      <FormField
                        control={signInForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Work email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail
                                  className={cn(
                                    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
                                    focusedField === "signin-email" ? "text-primary" : "text-muted-foreground",
                                  )}
                                />
                                <Input
                                  {...field}
                                  type="email"
                                  autoComplete="email"
                                  className="h-12 border-border/50 bg-background/50 pl-10 focus-visible:ring-primary/20"
                                  placeholder="name@bfcl.in"
                                  onFocus={() => setFocusedField("signin-email")}
                                  onBlur={() => setFocusedField(null)}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={signInForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Password</FormLabel>
                              <button
                                type="button"
                                onClick={() => setForgotOpen(true)}
                                className="text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                              >
                                Forgot password?
                              </button>
                            </div>
                            <FormControl>
                              <div className="relative">
                                <Lock
                                  className={cn(
                                    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
                                    focusedField === "signin-password" ? "text-primary" : "text-muted-foreground",
                                  )}
                                />
                                <Input
                                  {...field}
                                  type={showPassword ? "text" : "password"}
                                  autoComplete="current-password"
                                  className="h-12 border-border/50 bg-background/50 pl-10 pr-11 focus-visible:ring-primary/20"
                                  placeholder="Enter your password"
                                  onFocus={() => setFocusedField("signin-password")}
                                  onBlur={() => setFocusedField(null)}
                                />
                                <button
                                  type="button"
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                  onClick={() => setShowPassword((value) => !value)}
                                  aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-center gap-2">
                        <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(Boolean(checked))} />
                        <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal text-muted-foreground">
                          Remember me
                        </Label>
                      </div>

                      <Button type="submit" className="group h-11 w-full font-semibold" disabled={loading}>
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            Sign in
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                  <TabsContent value="signup" className="mt-6 space-y-6">
                    <Form {...signUpForm}>
                      <form onSubmit={handleSignUp} className="space-y-5">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <FormField
                          control={signUpForm.control}
                          name="displayName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full name</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                  <Input {...field} className="h-12 border-border/50 bg-background/50 pl-10" placeholder="Amit Kumar" />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signUpForm.control}
                          name="department"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Department</FormLabel>
                              <FormControl>
                                <Input {...field} className="h-12 border-border/50 bg-background/50" placeholder="Production" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <FormField
                          control={signUpForm.control}
                          name="jobTitle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Job title</FormLabel>
                              <FormControl>
                                <Input {...field} className="h-12 border-border/50 bg-background/50" placeholder="Shift engineer" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signUpForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Work email</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" className="h-12 border-border/50 bg-background/50" placeholder="name@bfcl.in" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={signUpForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Create password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type={showSignupPassword ? "text" : "password"}
                                  className="h-12 border-border/50 bg-background/50 pl-10 pr-11"
                                  placeholder="Minimum 8 characters"
                                />
                                <button
                                  type="button"
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                  onClick={() => setShowSignupPassword((value) => !value)}
                                  aria-label={showSignupPassword ? "Hide password" : "Show password"}
                                >
                                  {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="h-11 w-full gap-2 font-semibold" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create employee account"}
                        {!loading && <Factory className="h-4 w-4" />}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>

              <CardFooter className="relative flex flex-col gap-4">
                <div className="w-full text-center text-xs text-muted-foreground">Secure &amp; authenticated employee access</div>
                <div className="w-full rounded-md border border-border bg-panel px-4 py-4 text-center text-sm text-muted-foreground">
                  Need portal context first?{" "}
                  <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
                    Return to the employee landing page
                  </Link>
                  .
                </div>
              </CardFooter>
            </Card>
          </div>
        </section>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="border-border bg-card shadow-panel sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your work email and we’ll send a secure reset link to restore portal access.
            </DialogDescription>
          </DialogHeader>

          <Form {...forgotPasswordForm}>
            <form onSubmit={handleForgotPassword}>
              <div className="space-y-4 py-4">
                {forgotError && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                )}

              <FormField
                control={forgotPasswordForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input {...field} type="email" className="h-12 border-border/50 bg-background/50 pl-10" placeholder="name@bfcl.in" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={forgotLoading || cooldownRemaining > 0}>
                  {forgotLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Send reset link"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
