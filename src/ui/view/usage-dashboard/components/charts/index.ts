/**
 * Usage Dashboard chart primitives barrel.
 *
 * These wrap dashboard-local CSS patterns from
 * `dashboard-charts.css`. They live here (not in `@/ui/components/primitives`)
 * because they encode chart conventions that don't generalize to other
 * surfaces. If chat / onboarding / settings ever need one, promote it to
 * the global primitive layer (PR-0 playbook).
 */
export { BrandAvatar } from './BrandAvatar';
export type { BrandAvatarProps } from './BrandAvatar';

export { InlineTableBar } from './InlineTableBar';
export type { InlineTableBarProps } from './InlineTableBar';

export { HorizontalBar } from './HorizontalBar';
export type { HorizontalBarProps } from './HorizontalBar';

export { KpiActionCard } from './KpiActionCard';
export type { KpiActionCardProps } from './KpiActionCard';

export { SavingsDial } from './SavingsDial';
export type { SavingsDialProps } from './SavingsDial';

export { HelpAffordance } from './HelpAffordance';
export type { HelpAffordanceProps } from './HelpAffordance';

export { ExplainerPanel } from './ExplainerPanel';
export type { ExplainerEntry, ExplainerPanelProps } from './ExplainerPanel';

export { NumberedPager } from './NumberedPager';
export type { NumberedPagerProps } from './NumberedPager';
