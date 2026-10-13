"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Unable to sign in.");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-aside">
        <div className="brand-mark">PB</div>
        <p className="eyebrow">Independent pharmacy operations</p>
        <h1>Every counter decision, in one clear workspace.</h1>
        <p className="aside-copy">Batch-aware stock, fast billing, supplier payables, customer khata, and auditable books built around one store context.</p>
        <div className="aside-rule" />
        <p className="aside-caption">Your data stays in your own database and your own deployment.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="login-heading">
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to PillBills</h2>
            <p>Use your pharmacy credentials to continue.</p>
          </div>
          <form onSubmit={submit} className="login-form">
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-button" disabled={busy} type="submit">{busy ? "Signing in..." : "Sign in"}</button>
          </form>
          <p className="login-footnote">Protected by secure, database-backed sessions.</p>
        </div>
      </section>
    </main>
  );
}
