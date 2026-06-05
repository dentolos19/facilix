import { redirect } from "@tanstack/react-router";
import { createAuth } from "#/src/lib/auth/server";

interface SessionResult {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

export async function getSession(request: Request, binding: D1Database): Promise<SessionResult | null> {
  const auth = createAuth(binding);

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session as SessionResult | null;
}

export async function requireSession(request: Request, binding: D1Database): Promise<SessionResult> {
  const session = await getSession(request, binding);
  if (!session) {
    throw redirect({ to: "/auth" });
  }
  return session;
}
