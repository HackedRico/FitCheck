import { useState, type ReactNode } from "react";

import { PipelinePanel } from "./components/PipelinePanel";
import { SettingsSheet } from "./components/SettingsSheet";
import type { Route } from "./lib/route";
import { readSetting, writeSetting } from "./lib/storage";
import { ClosetScreen } from "./screens/ClosetScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { YouScreen } from "./screens/YouScreen";
import { useApp } from "./state/app";

// =============================================================================
// Module Overview
// =============================================================================
// The app shell. There are no tabs: a first visit sees `WelcomeScreen`, then the
// camera, and every scan moves forward to its result. The pipeline and settings
// sheets slide over whichever screen is showing.

const WELCOMED_KEY = "fitcheck.welcomed";

function Screen({ route }: { route: Route }): ReactNode {
  switch (route) {
    case "home":
      return <HomeScreen />;
    case "result":
      return <ResultScreen />;
    case "live":
      return <LiveScreen />;
    case "you":
      return <YouScreen />;
    case "closet":
      return <ClosetScreen />;
  }
}

/** The FitCheck shell around the current screen. */
export function App(): ReactNode {
  const { route, person, flow } = useApp();
  const [welcomed, setWelcomed] = useState(() => readSetting(WELCOMED_KEY, "no") === "yes");

  const finishWelcome = (): void => {
    writeSetting(WELCOMED_KEY, "yes");
    setWelcomed(true);
  };

  const showWelcome = !welcomed && person.photo === null && route === "home";
  // The page glow takes the verdict's colour while a result is on screen
  const decision = route === "result" && flow.judge.status === "done" ? flow.judge.value.verdict.decision : undefined;

  return (
    <div className="fc" data-route={showWelcome ? "welcome" : route} data-decision={decision}>
      {showWelcome ? <WelcomeScreen onDone={finishWelcome} /> : <Screen route={route} />}
      <PipelinePanel />
      <SettingsSheet />
    </div>
  );
}
