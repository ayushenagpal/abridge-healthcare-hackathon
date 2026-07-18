import { useSyncExternalStore } from "react";
import { Case, type Snapshot } from "../core/store";

// Single long-running case instance (the operational agent). The UI only
// visualizes it and emits simulation events.
export const caseStore = new Case();

export function useCase(): Snapshot {
  return useSyncExternalStore(caseStore.subscribe, caseStore.getSnapshot);
}
