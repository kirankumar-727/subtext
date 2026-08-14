import { BrandMark } from "@subtext/ui";

import { logout } from "@/app/auth/actions";

export default function AccessDeniedPage() {
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="denied-title">
        <BrandMark href="/login" />
        <div className="auth-card__copy">
          <p className="auth-card__eyebrow">Private Writer Workspace</p>
          <h1 id="denied-title">Access denied.</h1>
          <p className="auth-card__description">
            This account cannot access the Subtext workspace.
          </p>
        </div>
        <form action={logout}>
          <button className="auth-button auth-button--quiet" type="submit">
            Return to sign in
          </button>
        </form>
      </section>
    </main>
  );
}
