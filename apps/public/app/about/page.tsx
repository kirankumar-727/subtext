import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "About",
  description:
    "Subtext Media is an independent publication for research-driven documentary storytelling.",
};
export default function AboutPage() {
  return (
    <main id="main-content" className="about-page">
      <header>
        <p className="editorial-label">About Subtext</p>
        <h1>Everything has a subtext.</h1>
      </header>
      <div className="about-page__body">
        <p className="about-page__lead">
          Subtext is an independent digital publication built for stories that need context,
          evidence and room to unfold.
        </p>
        <section>
          <h2>What we publish</h2>
          <p>
            We examine history, business, psychology and important developments in society. The
            subject may be an empire, a company, a behavioural pattern or a contemporary event. The
            editorial question is the same: what is happening beneath the visible story?
          </p>
        </section>
        <section>
          <h2>What we do not publish</h2>
          <p>
            Subtext is not a daily-news feed, political debate platform, celebrity publication or
            collection of disposable opinions. We publish when the research supports a useful story.
          </p>
        </section>
        <section>
          <h2>Our method</h2>
          <p>
            Stories are built from identifiable sources, clear citations and careful distinctions
            between evidence, interpretation and uncertainty. Material corrections belong to the
            publication record rather than disappearing silently.
          </p>
        </section>
        <blockquote>Curiosity begins with what happened. Understanding begins with why.</blockquote>
      </div>
    </main>
  );
}
