"use client";

import { createAuthClient } from "better-auth/react";

// Browser auth client (Better Auth). Same-origin → talks to
// /api/auth/[...all]. Drives the sign-in/up + GitHub OAuth + sign-out UI
// and the useSession hook.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
