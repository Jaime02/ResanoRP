import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";

// The server's clock can be on another day than the browser's, so the current time is left out until hydrated
export function useNow(): Date | null {
  const isHydrated = useHydrated();
  const [now] = useState(() => new Date());
  return isHydrated ? now : null;
}
