/**
 * Temporary compatibility re-export. `intensityTier` moved to the shared
 * Result Browser package (`@/ui/component/result-browser/model/intensityTier`)
 * in the 2026-07-21 extraction. Existing import sites (and
 * `test/result-tree-intensity.test.ts`) resolve through this shim.
 */
export { intensityTier } from '@/ui/component/result-browser/model/intensityTier';
export type { IntensityTier } from '@/ui/component/result-browser/model/intensityTier';
