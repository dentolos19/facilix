import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/src/components/ui/card";
import { Input } from "#/src/components/ui/input";
import { Spinner } from "#/src/components/ui/spinner";
import { signIn, signUp, useSession } from "#/src/lib/auth/client";

type AuthMode = "login" | "register";

const modeConfig = {
  login: {
    title: "Sign in",
    description: "Enter your credentials to continue",
    submitLabel: "Sign in",
    loadingLabel: "Signing in…",
    footerPrefix: "Don't have an account?",
    footerLinkLabel: "Sign up",
    otherMode: "register" as AuthMode,
  },
  register: {
    title: "Create account",
    description: "Fill in your details to get started",
    submitLabel: "Create account",
    loadingLabel: "Creating account…",
    footerPrefix: "Already have an account?",
    footerLinkLabel: "Sign in",
    otherMode: "login" as AuthMode,
  },
} as const;

export const Route = createFileRoute("/(public)/auth")({
  component: AuthPage,
  validateSearch: (search: Record<string, unknown>): { mode?: AuthMode } => ({
    mode: search.mode === "register" ? "register" : "login",
  }),
});

function AuthPage() {
  const { mode = "login" } = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  // Auto-redirect to dashboard if already logged in
  useEffect(() => {
    if (!isPending && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, isPending, navigate]);

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Spinner className="size-8" />
      </main>
    );
  }

  if (session) {
    return null;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm pt-0">
        <div className="flex border-b border-border">
          <button
            className={`flex-1 px-4 py-3 text-center text-sm font-medium transition-colors ${
              mode === "login"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => navigate({ to: "/auth", search: { mode: "login" }, replace: true })}
          >
            Sign in
          </button>
          <button
            className={`flex-1 px-4 py-3 text-center text-sm font-medium transition-colors ${
              mode === "register"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => navigate({ to: "/auth", search: { mode: "register" }, replace: true })}
          >
            Create account
          </button>
        </div>
        {mode === "login" ? <LoginForm /> : <RegisterForm />}
      </Card>
    </main>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result?.error) {
        throw new Error(result.error.message ?? "Invalid email or password.");
      }
      toast.success("Welcome back!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{modeConfig.login.title}</CardTitle>
        <CardDescription>{modeConfig.login.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              autoComplete="email"
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              autoComplete="current-password"
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button disabled={loading} type="submit">
            {loading ? modeConfig.login.loadingLabel : modeConfig.login.submitLabel}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link className="underline underline-offset-2" search={{ mode: "register" }} to="/auth">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </>
  );
}

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signUp.email({ name, email, password });
      if (result?.error) {
        throw new Error(result.error.message ?? "Registration failed. Please try again.");
      }
      toast.success("Account created successfully! Welcome to Facilix.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed. Please try again.";
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{modeConfig.register.title}</CardTitle>
        <CardDescription>{modeConfig.register.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="name">
              Name
            </label>
            <Input
              autoComplete="name"
              id="name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              type="text"
              value={name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              autoComplete="email"
              id="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              autoComplete="new-password"
              id="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button disabled={loading} type="submit">
            {loading ? modeConfig.register.loadingLabel : modeConfig.register.submitLabel}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="underline underline-offset-2" search={{ mode: "login" }} to="/auth">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </>
  );
}
