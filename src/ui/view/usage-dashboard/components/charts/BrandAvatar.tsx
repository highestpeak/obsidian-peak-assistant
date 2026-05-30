/**
 * BrandAvatar — kept here as an alias for dashboard.
 *
 * Dashboard charts (provider grouping, table rows, hbar lists) reach for a
 * `BrandAvatar` so often that it reads as a local primitive. The actual
 * implementation lives in PR-0 `@/ui/components/primitives/BrandAvatar` and
 * is re-exported verbatim here — no behavioural divergence.
 */
export { BrandAvatar } from '@/ui/components/primitives';
export type { BrandAvatarProps } from '@/ui/components/primitives';
