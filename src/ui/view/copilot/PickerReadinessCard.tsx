/**
 * Shared "Readiness card" component used by Document / Vault / Setting picker tabs.
 *
 * Layout (matches docs/superpowers/mockups/2026-05-22-vault-review-mockup.html
 * picker scenes):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [icon]  Title                                  Run strategy ⓘ│
 *   │         Description                             [Primary btn] │
 *   │         [chip][chip][chip][chip][chip]          [Secondary]   │
 *   │                                                 Customize     │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The card itself is layout-only. Each picker tab feeds it the right icon,
 * copy, signal chips, and run-strategy buttons.
 */

import React from 'react';
import { HelpCircle, Sliders, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { Pill } from '@/ui/component/shared-ui/pill';

export interface SignalChip {
	icon?: LucideIcon;
	label: string;
	tone?: 'neutral' | 'success' | 'warning';
	/**
	 * For "1 note changed" style chips that lead with a coloured dot instead of an icon.
	 */
	dotColor?: 'amber' | 'success' | 'danger';
}

export interface RunStrategyButton {
	label: string;
	icon?: LucideIcon;
	onClick?: () => void;
	disabled?: boolean;
	title?: string;
	variant: 'primary' | 'secondary' | 'ghost';
}

export interface PickerReadinessCardProps {
	icon: LucideIcon;
	/** Optional warning/alert badge over the icon corner. */
	badge?: { icon: LucideIcon; tone: 'warning' | 'danger' };
	title: string;
	description: React.ReactNode;
	signals: SignalChip[];
	runStrategy: RunStrategyButton[];
	onCustomize?: () => void;
}

const dotPalette: Record<NonNullable<SignalChip['dotColor']>, string> = {
	amber: '#F59E0B',
	success: 'var(--pk-success)',
	danger: 'var(--pk-error)',
};

export function PickerReadinessCard({
	icon: Icon,
	badge,
	title,
	description,
	signals,
	runStrategy,
	onCustomize,
}: PickerReadinessCardProps) {
	const BadgeIcon = badge?.icon;
	return (
		<div className="pktw-grid pktw-grid-cols-[1fr_220px] pktw-gap-7 pktw-rounded-2xl pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-6 pktw-py-5 pktw-shadow-sm">
			<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-4 pktw-items-start pktw-min-w-0">
				<div className="pktw-relative pktw-w-[54px] pktw-h-[54px] pktw-rounded-2xl pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
					<Icon className="pktw-w-7 pktw-h-7" strokeWidth={1.6} />
					{BadgeIcon ? (
						<span
							className={cn(
								'pktw-absolute pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-border-[3px] pktw-border-pk-surface pktw-flex pktw-items-center pktw-justify-center',
								badge.tone === 'warning'
									? 'pktw-bg-pk-warning-bg pktw-text-pk-warning'
									: 'pktw-bg-pk-error-bg pktw-text-pk-error',
							)}
							style={{ bottom: '-4px', right: '-4px' }}
						>
							<BadgeIcon className="pktw-w-3 pktw-h-3" strokeWidth={2.5} />
						</span>
					) : null}
				</div>
				<div className="pktw-min-w-0">
					<h2 className="pktw-m-0 pktw-mt-0.5 pktw-mb-1.5 pktw-text-[17px] pktw-font-bold pktw-leading-tight pktw-text-pk-foreground">
						{title}
					</h2>
					<div className="pktw-text-[13px] pktw-leading-snug pktw-text-pk-foreground-muted pktw-mb-3.5">
						{description}
					</div>
					<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
						{signals.map((s, i) => (
							<SignalChipView key={i} chip={s} />
						))}
					</div>
				</div>
			</div>
			<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-min-w-0">
				<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-mb-0.5">
					<span>Run strategy</span>
					<HelpCircle className="pktw-w-3 pktw-h-3" strokeWidth={2} />
				</div>
				{runStrategy.map((btn, i) => (
					<Button
						key={i}
						onClick={btn.onClick}
						disabled={btn.disabled}
						title={btn.title}
						variant={
							btn.variant === 'primary'
								? 'default'
								: btn.variant === 'secondary'
									? 'outline'
									: 'ghost'
						}
						className={cn(
							'pktw-w-full pktw-h-10 pktw-px-3 pktw-gap-2 pktw-font-semibold pktw-text-[13px]',
							btn.variant === 'ghost' && 'pktw-justify-center pktw-text-pk-foreground-muted',
						)}
					>
						{btn.icon ? <btn.icon className="pktw-w-4 pktw-h-4" /> : null}
						{btn.label}
					</Button>
				))}
				{onCustomize ? (
					<Button
						variant="ghost"
						onClick={onCustomize}
						className="pktw-w-full pktw-h-9 pktw-gap-2 pktw-justify-center pktw-text-pk-foreground-muted pktw-text-[13px]"
					>
						<Sliders className="pktw-w-4 pktw-h-4" />
						Customize
					</Button>
				) : null}
			</div>
		</div>
	);
}

function SignalChipView({ chip }: { chip: SignalChip }) {
	const ChipIcon = chip.icon;
	const tone = chip.tone ?? 'neutral';
	return (
		<span
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-lg pktw-text-[11.5px] pktw-font-medium pktw-border',
				tone === 'success'
					? 'pktw-bg-pk-success-bg pktw-text-pk-success-text pktw-border-transparent'
					: tone === 'warning'
						? 'pktw-bg-pk-warning-bg pktw-text-pk-warning-text pktw-border-transparent'
						: 'pktw-bg-pk-surface pktw-text-pk-foreground-muted pktw-border-pk-border-soft',
			)}
		>
			{chip.dotColor ? (
				<span
					className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-shrink-0"
					style={{ background: dotPalette[chip.dotColor] }}
				/>
			) : ChipIcon ? (
				<ChipIcon
					className={cn(
						'pktw-w-3.5 pktw-h-3.5',
						tone === 'neutral' && 'pktw-text-pk-foreground-faint',
					)}
				/>
			) : null}
			<span>{chip.label}</span>
		</span>
	);
}

/**
 * Light-weight intent row used in the Suggested intents column on each picker tab.
 * Keeps prop surface tight; pickers can render lists of these directly.
 */
export interface SuggestedIntentRowProps {
	icon: LucideIcon;
	title: string;
	subtitle: string;
	pill?: { label: string; variant: 'accent' | 'warning' | 'success' | 'info' };
	tone?: 'accent' | 'indigo' | 'cyan' | 'orange' | 'pink';
	onClick?: () => void;
	disabled?: boolean;
}

const intentToneClass: Record<NonNullable<SuggestedIntentRowProps['tone']>, string> = {
	accent: 'pktw-bg-pk-accent-tint pktw-text-pk-accent',
	indigo: 'pktw-bg-pk-indigo-bg pktw-text-pk-indigo-text',
	cyan: 'pktw-bg-cyan-100 pktw-text-cyan-700 dark:pktw-bg-cyan-900/30 dark:pktw-text-cyan-300',
	orange: 'pktw-bg-orange-100 pktw-text-orange-700 dark:pktw-bg-orange-900/30 dark:pktw-text-orange-300',
	pink: 'pktw-bg-pink-100 pktw-text-pink-700 dark:pktw-bg-pink-900/30 dark:pktw-text-pink-300',
};

export function SuggestedIntentRow({
	icon: Icon,
	title,
	subtitle,
	pill,
	tone = 'accent',
	onClick,
	disabled,
}: SuggestedIntentRowProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'pktw-w-full pktw-grid pktw-grid-cols-[auto_minmax(0,1fr)_auto] pktw-items-start pktw-gap-3.5 pktw-px-4 pktw-py-3.5 pktw-rounded-lg pktw-border pktw-border-pk-border-soft pktw-bg-pk-surface pktw-text-left pktw-transition-colors',
				'hover:pktw-border-pk-accent-soft hover:pktw-bg-pk-accent-tint',
				'disabled:pktw-opacity-60 disabled:pktw-pointer-events-none',
			)}
		>
			<span className={cn('pktw-w-9 pktw-h-9 pktw-rounded-[10px] pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0', intentToneClass[tone])}>
				<Icon className="pktw-w-4 pktw-h-4" />
			</span>
			<span className="pktw-flex pktw-flex-col pktw-min-w-0 pktw-gap-0.5 pktw-pt-0.5">
				<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
					<span className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground pktw-truncate">{title}</span>
					{pill ? <Pill variant={pill.variant} size="sm" className="pktw-shrink-0">{pill.label}</Pill> : null}
				</span>
				<span
					className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-snug"
					style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
				>
					{subtitle}
				</span>
			</span>
			<span className="pktw-text-pk-foreground-faint pktw-shrink-0 pktw-self-center pktw-text-lg pktw-leading-none" aria-hidden>
				›
			</span>
		</button>
	);
}
