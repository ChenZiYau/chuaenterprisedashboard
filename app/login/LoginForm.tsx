"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const from = useSearchParams().get("from") ?? "";

  return (
    <form
      action={formAction}
      className="w-full max-w-[420px] rounded-2xl p-8 sm:p-10"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-soft)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06)",
      }}
    >
      <input type="hidden" name="from" value={from} />

      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Welcome back,
      </h1>
      <p className="text-lg font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
        Please sign in to your account.
      </p>

      {state.error && (
        <div
          className="mt-5 rounded-lg px-3.5 py-2.5 text-sm"
          style={{
            background: "color-mix(in srgb, var(--danger) 12%, transparent)",
            color: "var(--danger)",
            border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
          }}
          role="alert"
        >
          {state.error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Field label="Email">
          <input
            name="identifier"
            type="text"
            autoComplete="username"
            required
            autoFocus
            placeholder="Email Or Username"
            className="ui-field w-full"
          />
        </Field>

        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Password here"
            className="ui-field w-full"
          />
        </Field>

        <label
          className="flex items-center gap-2 text-sm select-none cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <input
            name="remember"
            type="checkbox"
            className="w-4 h-4 rounded"
            style={{ accentColor: "var(--accent)" }}
          />
          Remember Me
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {pending ? "Signing in…" : "Click to Login"}
        </button>
      </div>

      <div className="mt-6 text-center">
        <a
          href="#"
          className="text-sm font-medium hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Forgot Your Password?
        </a>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
