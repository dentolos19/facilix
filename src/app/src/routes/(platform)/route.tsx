import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Spinner } from "#/src/components/ui/spinner";
import { useSession } from "#/src/lib/auth/client";
import { requireSession } from "#/src/lib/auth/guard";

export const Route = createFileRoute("/(platform)")({
  beforeLoad: async ({ context }) => {
    const request = (context as { request?: Request }).request;
    const binding = (context as { cloudflare?: { env?: { DB?: D1Database } } }).cloudflare?.env?.DB;

    // Server-side: verify session against the database
    if (request && binding) {
      await requireSession(request, binding);
    }
    // Client-side check is handled in the component below
  },
  component: Layout,
});

function Layout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/auth" });
    }
  }, [session, isPending, navigate]);

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <Outlet />;
}
