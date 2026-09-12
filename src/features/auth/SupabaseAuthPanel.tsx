/**
 * Prompt 15 — Optional Supabase account panel (magic link, no passwords).
 *
 * Honesty rules enforced here:
 * - When Supabase env is absent, no email field is shown at all: there is
 *   nothing to sign into, and the panel says demo data stays in this browser.
 * - Success copy ("check your email") appears ONLY after Supabase confirms
 *   the link was sent — never optimistically.
 * - Signed-in state shows the account email and a working Sign out button.
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured } from "@/backend/supabase";
import { MAGIC_LINK_REQUEST_MESSAGE } from "@/backend/supabase/authProvider";

export function SupabaseAuthPanel() {
  const auth = useAuth();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const sendLink = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const provider = await import("@/backend/supabase").then((m) => m.resolveAuthProvider());
      if (!("requestMagicLink" in provider) || typeof provider.requestMagicLink !== "function") {
        setNotice({ tone: "error", text: "Sign-in is not configured. Your data stays in this browser." });
        return;
      }
      const result = await (provider as { requestMagicLink(email: string): Promise<{ sent: boolean; message: string }> }).requestMagicLink(email);
      setNotice({ tone: result.sent ? "ok" : "error", text: result.sent ? MAGIC_LINK_REQUEST_MESSAGE : result.message });
      if (result.sent) setEmail("");
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not send the sign-in link. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const provider = await import("@/backend/supabase").then((m) => m.resolveAuthProvider());
      await provider.signOut();
      setNotice({ tone: "ok", text: "Signed out. This browser is back to local demo mode." });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not sign out. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const signedIn = auth.status === "authenticated" && auth.user;

  return (
    <section className="container" style={{ padding: "16px 0 0" }} aria-label="Your account">
      <div className="card" style={{ padding: 16 }}>
        <strong className="small" style={{ display: "block", marginBottom: 4 }}>Your account (optional)</strong>
        {!configured && (
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
            Local demo mode — your data is saved only in this browser. Online accounts are not set up in this demo.
          </p>
        )}
        {configured && !signedIn && (
          <div>
            <p className="small muted" style={{ margin: "0 0 10px", lineHeight: 1.6 }}>
              Sign in with your email to use your private online account. We never ask for a password here — we email you a one-time sign-in link.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.in"
                aria-label="Email address"
                disabled={busy}
                style={{ flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)" }}
              />
              <button className="btn btn--primary btn--sm" onClick={sendLink} disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </div>
          </div>
        )}
        {configured && signedIn && (
          <div>
            <p className="small" style={{ margin: "0 0 10px", lineHeight: 1.6 }}>
              Signed in via Supabase{auth.user?.displayName ? ` as ${auth.user.displayName}` : ""}. Demo cases on this device stay in this browser until cloud sync is added.
            </p>
            <button className="btn btn--secondary btn--sm" onClick={signOut} disabled={busy}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
        {notice && (
          <p className="small" role="status" style={{ margin: "10px 0 0", color: notice.tone === "ok" ? "#065f46" : "#991b1b" }}>
            {notice.text}
          </p>
        )}
      </div>
    </section>
  );
}
