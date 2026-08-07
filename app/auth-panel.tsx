"use client";

import { FormEvent, useEffect, useState } from "react";
import { auth, type Law18Session } from "./auth-client";

type AuthPanelProps = {
  onSession: (session: Law18Session) => void;
  recovery?: boolean;
  initialMessage?: string;
};

export function AuthPanel({ onSession, recovery = false, initialMessage = "" }: AuthPanelProps) {
  const [joinToken, setJoinToken] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "recovery">(recovery ? "recovery" : "login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("falkref91@gmail.com");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);

  // Recovery is an external authentication state transition.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMode(recovery ? "recovery" : "login"), [recovery]);
  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("join") || localStorage.getItem("law18ref-join-token") || "";
    if (token) localStorage.setItem("law18ref-join-token", token);
    // Join context is sourced from the browser after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinToken(token);
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      onSession(await auth.signIn(email, password));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRecovery() {
    if (!email) return setMessage("Enter your email address first.");
    setBusy(true);
    setMessage("");
    try {
      await auth.sendRecovery(email);
      setMessage("Password setup email sent. Check your inbox.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the email.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The passwords do not match.");
    setBusy(true);
    setMessage("");
    try {
      const { session } = auth.initialize();
      if (!session) throw new Error("This password link has expired. Request a new one.");
      onSession(await auth.updatePassword(await auth.ensureValidSession(session), password));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save your password.");
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    setBusy(true);
    setMessage("");
    try {
      const redirect = joinToken
        ? `${window.location.origin}/?join=${encodeURIComponent(joinToken)}`
        : window.location.origin;
      const result = await auth.signUp(email, password, fullName, redirect);
      if (result.access_token) onSession(result);
      else setMessage("Check your email to confirm your account, then sign in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <span className="auth-logo-lockup"><img src="/logo-draft-law18referee-management-v4.png" alt="Law18Referee Management" /></span>
      </section>
      <section className="auth-card">
        <p className="eyebrow">{joinToken ? "JOIN GROUP INVITATION" : "WELCOME TO LAW18REFEREE MANAGEMENT"}</p>
        <h1>{mode === "recovery" ? "Create your password" : mode === "signup" ? "Create referee account" : "Sign in"}</h1>
        <p className="auth-intro">
          {mode === "recovery"
            ? "Choose a secure password to finish setting up your account."
            : mode === "signup"
              ? joinToken ? "Create your account to join the group connected to this invitation." : "Use the same email address your assignor imported from Assignr."
              : joinToken ? "Sign in to join the group connected to this invitation." : "Access tournament check-in, schedules, coaching, and ratings."}
        </p>
        <form onSubmit={mode === "recovery" ? updatePassword : mode === "signup" ? createAccount : signIn}>
          {mode === "signup" && <label>Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /></label>}
          {mode !== "recovery" && (
            <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          )}
          <label>{mode === "recovery" ? "New password" : "Password"}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "recovery" ? "new-password" : "current-password"} minLength={8} required /></label>
          {mode === "recovery" && (
            <label>Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
          )}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary wide" disabled={busy}>{busy ? "Please wait…" : mode === "recovery" ? "Save password" : mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        {mode === "login" && <>
          <button className="auth-link" onClick={() => setMode("signup")} disabled={busy}>New referee? Create an account</button>
          <button className="auth-link compact-link" onClick={sendRecovery} disabled={busy}>Set or reset your password</button>
        </>}
        {mode === "signup" && <button className="auth-link" onClick={() => setMode("login")} disabled={busy}>Already have an account? Sign in</button>}
      </section>
    </main>
  );
}
