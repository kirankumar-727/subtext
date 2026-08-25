import { SettingsForm } from "@/components/settings-form";
import { getSiteSettings } from "@/lib/cms/queries";

export default async function SettingsPage() {
  const settings = await getSiteSettings();
  const publicationName = String(settings["brand.name"] ?? "Subtext Media");
  const tagline = String(settings["brand.tagline"] ?? "Everything has a subtext.");

  return (
    <main className="workspace-page workspace-page--settings">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Publication identity</p>
          <h1>Settings</h1>
          <p className="workspace-page__lede">
            Set the small, public-facing details that make Subtext feel like a publication rather
            than a product shell.
          </p>
        </div>
      </header>
      <SettingsForm initialName={publicationName} initialTagline={tagline} />
    </main>
  );
}
