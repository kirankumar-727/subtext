import { updateSiteSettings } from "@/app/admin/cms-actions";
import { getSiteSettings } from "@/lib/cms/queries";
export default async function SettingsPage() {
  const settings = await getSiteSettings();
  return (
    <main className="workspace-page workspace-page--narrow">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Publication</p>
          <h1>Settings</h1>
        </div>
      </header>
      <form action={updateSiteSettings} className="management-form">
        <label>
          Publication name
          <input
            defaultValue={String(settings["brand.name"] ?? "Subtext Media")}
            name="brandName"
          />
        </label>
        <label>
          Tagline
          <input
            defaultValue={String(settings["brand.tagline"] ?? "Everything has a subtext.")}
            name="tagline"
          />
        </label>
        <button className="primary-action" type="submit">
          Save settings
        </button>
      </form>
    </main>
  );
}
