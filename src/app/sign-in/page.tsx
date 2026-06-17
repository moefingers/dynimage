import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/app/_components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

// useSearchParams (for ?redirect=) requires a Suspense boundary.
export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
