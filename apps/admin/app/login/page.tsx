import { BrandMark } from "@subtext/ui";

import { signInWithGitHub } from "@/app/auth/actions";

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

        <form action={signInWithGitHub}>
          <button className="auth-button" type="submit">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.92.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.53-1.36-1.31-1.72-1.31-1.72-1.07-.73.08-.72.08-.72 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.75 1.28 3.42.98.11-.76.41-1.28.75-1.58-2.55-.29-5.23-1.27-5.23-5.67 0-1.25.45-2.27 1.2-3.07-.12-.3-.52-1.45.11-3.02 0 0 .98-.31 3.2 1.17A11.1 11.1 0 0 1 12 6.07c.99 0 1.99.13 2.93.39 2.22-1.48 3.2-1.17 3.2-1.17.63 1.57.23 2.72.11 3.02.75.8 1.2 1.82 1.2 3.07 0 4.41-2.69 5.37-5.25 5.66.41.36.78 1.08.78 2.18v3.23c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            Continue with GitHub
          </button>
        </form>

        <p className="auth-card__footnote">Authorized access only.</p>
      </section>
    </main>
  );
}