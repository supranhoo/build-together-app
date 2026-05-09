/**
 * 21-step CLU heat lifecycle definition. Pure data, no React imports —
 * used by the heat-entry sheet to drive the left rail and gate which
 * sub-form is active for the current step.
 *
 * Steps are grouped into phases (header → charge → blow → sample → tap →
 * post-tap → quality → submit). The phase id maps to the form rendered
 * on the right pane.
 */
export type CluPhase =
  | "header"
  | "charge"
  | "blow"
  | "sample"
  | "tap"
  | "output"
  | "energy"
  | "delays"
  | "submit";

export interface CluLifecycleStep {
  index: number;
  label: string;
  phase: CluPhase;
}

export const CLU_LIFECYCLE: CluLifecycleStep[] = [
  { index: 0, label: "Heat header & grade", phase: "header" },
  { index: 1, label: "Charge plan vs SOP", phase: "header" },
  { index: 2, label: "Bath preparation", phase: "header" },
  { index: 3, label: "Initial additions", phase: "charge" },
  { index: 4, label: "Flux additions", phase: "charge" },
  { index: 5, label: "Reductant additions", phase: "charge" },
  { index: 6, label: "Start blowing", phase: "blow" },
  { index: 7, label: "Mid-blow tick", phase: "blow" },
  { index: 8, label: "Temperature trim", phase: "blow" },
  { index: 9, label: "Initial sample", phase: "sample" },
  { index: 10, label: "Mid sample", phase: "sample" },
  { index: 11, label: "Final sample", phase: "sample" },
  { index: 12, label: "Tap preparation", phase: "tap" },
  { index: 13, label: "Tapping", phase: "tap" },
  { index: 14, label: "Slag handling", phase: "output" },
  { index: 15, label: "Output weights", phase: "output" },
  { index: 16, label: "Energy summary", phase: "energy" },
  { index: 17, label: "Power factor & aux", phase: "energy" },
  { index: 18, label: "Delays & downtime", phase: "delays" },
  { index: 19, label: "QC sign-off", phase: "submit" },
  { index: 20, label: "Submit for approval", phase: "submit" },
];

export const TOTAL_STEPS = CLU_LIFECYCLE.length;

export function phaseForStep(index: number): CluPhase {
  return CLU_LIFECYCLE[Math.max(0, Math.min(index, TOTAL_STEPS - 1))].phase;
}
