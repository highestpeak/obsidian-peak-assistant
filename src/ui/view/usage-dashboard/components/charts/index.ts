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

export { PaceBar } from './PaceBar';
export type { PaceBarProps } from './PaceBar';

export { Sparkline } from './Sparkline';
export type { SparklineProps } from './Sparkline';

export { Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';

export { Field, NumberField } from './Field';
export type { FieldProps, NumberFieldProps } from './Field';

export { RecommendationBlock } from './RecommendationBlock';
export type { RecommendationBlockProps } from './RecommendationBlock';

export { ScenarioRadio } from './ScenarioRadio';
export type { ScenarioRadioProps } from './ScenarioRadio';

export { RuleRow } from './RuleRow';
export type { RuleRowProps } from './RuleRow';
