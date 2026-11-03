import { cubicBezier } from "framer-motion";

/** Milliseconds for CSS and map cameras; Framer transitions convert to seconds below.
 * The CSS mirror in theme.css is checked by motion.test.ts. */
export const HP_MOTION = {
  press: 80,
  micro: 120,
  state: 160,
  content: 190,
  panel: 240,
  pan: 280,
  spatial: 320,
  overview: 340,
  focus: 380,
  selection: 650,
  atmosphere: 800,
  tab: 180,
} as const;
export const HP_EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const HP_EASE_STANDARD: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
export const HP_MAP_EASE = cubicBezier(...HP_EASE_OUT);
const transition = (duration: number, ease = HP_EASE_STANDARD) => ({
  duration: duration / 1000,
  ease,
});
export const HP_TRANSITION = {
  press: transition(HP_MOTION.press),
  micro: transition(HP_MOTION.micro),
  state: transition(HP_MOTION.state),
  panel: transition(HP_MOTION.panel, HP_EASE_OUT),
  spatial: transition(HP_MOTION.spatial, HP_EASE_OUT),
  tab: transition(HP_MOTION.tab, HP_EASE_OUT),
  sheetContent: transition(HP_MOTION.content, HP_EASE_OUT),
} as const;
