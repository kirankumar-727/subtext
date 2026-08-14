import { BrandMark } from "@subtext/ui";

import { signInWithGoogle } from "@/app/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <BrandMark href="/login" />
        <div className="auth-card__copy">
          <p className="auth-card__eyebrow">Private Writer Workspace</p>
          <h1 id="login-title">Continue to Subtext.</h1>
        </div>

        {error ? (
          <p className="auth-message" role="alert">
            Authentication could not be completed. Please try again.
          </p>
        ) : null}

        <form action={signInWithGoogle}>
          <button className="auth-button" type="submit">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
                fill="#4285F4"
              />
              <path
                d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.97-3.39.97-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
                fill="#34A853"
              />
              <path
                d="M6.39 13.87A6.02 6.02 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.62Z"
                fill="#FBBC05"
              />
              <path
                d="M12 6c1.47 0 2.78.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 6 12 6Z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="auth-card__footnote">Authorized access only.</p>
      </section>
    </main>
  );
}
