import packageJson from "../../../package.json";

import { SettingsControlCenter } from "@/components/settings-form";
import { getSettingsControlCenterData } from "@/lib/cms/queries";
import type { SettingsEnvironment } from "@/lib/cms/types";

function safeOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function readEnvironment(): SettingsEnvironment {
  const configuredEnvironment = process.env.VERCEL_ENV;
  const environment =
    configuredEnvironment === "preview" || configuredEnvironment === "development"
      ? configuredEnvironment
      : configuredEnvironment === "production" || process.env.NODE_ENV === "production"
        ? "production"
        : "development";

  return {
    environment,
    appVersion: packageJson.version,
    siteOrigin: safeOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  };
}

export default async function SettingsPage() {
  const data = await getSettingsControlCenterData();
  const environment = readEnvironment();

  return (
    <main className="workspace-page workspace-page--settings">
      <header className="workspace-page__header settings-page-header">
        <div>
          <p className="workspace-eyebrow">Publication control center</p>
          <h1>Settings</h1>
          <p className="workspace-page__lede">
            Keep the publication&apos;s identity close, and see how the editorial system is behaving
            without reaching into infrastructure.
          </p>
        </div>
        <div className="settings-page-header__status" aria-label="Settings status">
          <span aria-hidden="true" />
          <span>Control center</span>
        </div>
      </header>
      <SettingsControlCenter data={data} environment={environment} />
    </main>
  );
}
