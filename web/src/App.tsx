import type { ReactNode } from "react";

import { Icon, type IconName } from "./components/Icons";
import { PipelinePanel, PrivacyRail } from "./components/PipelinePanel";
import { SettingsSheet } from "./components/SettingsSheet";
import { StylistDrawer } from "./components/StylistDrawer";
import type { Route } from "./lib/route";
import { ClosetScreen } from "./screens/ClosetScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { MeScreen } from "./screens/MeScreen";
import { RenderScreen } from "./screens/RenderScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { useApp } from "./state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The app shell: masthead with the tabs, the privacy rail that opens the
// pipeline panel, the current screen, and the sheets that slide over it.

const TABS: readonly { route: Route; label: string; icon: IconName }[] = [
  { route: "scan", label: "Scan", icon: "camera" },
  { route: "live", label: "Live", icon: "live" },
  { route: "me", label: "Me", icon: "person" },
  { route: "closet", label: "Closet", icon: "hanger" },
];

function Screen({ route }: { route: Route }): ReactNode {
  switch (route) {
    case "scan":
      return <ScanScreen />;
    case "live":
      return <LiveScreen />;
    case "me":
      return <MeScreen />;
    case "closet":
      return <ClosetScreen />;
    case "render":
      return <RenderScreen />;
  }
}

/** The FitCheck shell around the current screen. */
export function App(): ReactNode {
  const { route, navigate, openSheet } = useApp();
  const tabs = TABS.map((tab) => (
    <button
      key={tab.route}
      type="button"
      className="tab"
      aria-current={route === tab.route ? "page" : undefined}
      onClick={() => navigate(tab.route)}
    >
      <Icon name={tab.icon} />
      <span>{tab.label}</span>
    </button>
  ));

  return (
    <div className="app" data-route={route}>
      <header className="masthead">
        <button type="button" className="wordmark display" onClick={() => navigate("scan")}>
          Fit<span>Check</span>
        </button>
        <nav className="tabs tabs-top" aria-label="Screens">
          {tabs}
        </nav>
        <button type="button" className="icon-btn" onClick={() => openSheet("settings")} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </header>
      <PrivacyRail />
      <main className="screen">
        <Screen route={route} />
      </main>
      <nav className="tabs tabs-bottom" aria-label="Screens">
        {tabs}
      </nav>
      <PipelinePanel />
      <SettingsSheet />
      <StylistDrawer />
    </div>
  );
}
