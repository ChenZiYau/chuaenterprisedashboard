import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Chua Enterprise" };

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "var(--background)" }}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
