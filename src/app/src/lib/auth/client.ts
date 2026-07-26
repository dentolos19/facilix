import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

export function hasAdminRole(user: unknown) {
  return typeof user === "object" && user !== null && "role" in user && user.role === "admin";
}
