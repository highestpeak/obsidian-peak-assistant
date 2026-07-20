import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Pill } from './pill';

/**
 * Lightweight Tabs primitive used by the Vault Review picker (3 scope tabs)
 * and the report modal (6 result tabs).
 *
 * Two visual variants:
 *   - 'segment': big segmented header where each tab has a title + subtitle
 *               (Document / Vault / Setting picker). Active tab has a purple
 *               underline + tinted title.
 *   - 'underline': flat text tabs with a count badge and a thin purple
 *                 underline on the active tab (report modal).
 *
 * Controlled via `value` + `onValueChange`. Children render conditionally via
 * `<TabsPanel value="..."/>` siblings.
 */

type Variant = 'segment' | 'underline';

interface TabsContextValue {
	value: string;
	onValueChange: (v: string) => void;
	variant: Variant;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsCtx(component: string): TabsContextValue {
	const ctx = React.useContext(TabsContext);
	if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>`);
	return ctx;
}

export interface TabsProps {
	value: string;
	onValueChange: (v: string) => void;
	variant?: Variant;
	className?: string;
	children?: React.ReactNode;
}

export function Tabs({ value, onValueChange, variant = 'underline', className, children }: TabsProps) {
	const ctx = React.useMemo(() => ({ value, onValueChange, variant }), [value, onValueChange, variant]);
	return (
		<TabsContext.Provider value={ctx}>
			<div className={cn('peak-tabs', `peak-tabs--${variant}`, className)}>{children}</div>
		</TabsContext.Provider>
	);
}

export interface TabsListProps {
	className?: string;
	children?: React.ReactNode;
}

export function TabsList({ className, children }: TabsListProps) {
	const { variant } = useTabsCtx('TabsList');
	if (variant === 'segment') {
		return (
			<div
				role="tablist"
				className={cn(
					'pktw-grid pktw-grid-cols-3 pktw-border-b pktw-border-pk-border',
					className,
				)}
			>
				{children}
			</div>
		);
	}
	return (
		<div
			role="tablist"
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-5 pktw-border-b pktw-border-pk-border',
				className,
			)}
		>
			{children}
		</div>
	);
}

export interface TabsTriggerProps {
	value: string;
	count?: number;
	title?: string;
	subtitle?: string;
	className?: string;
	children?: React.ReactNode;
}

/**
 * Segment variant uses `title` + `subtitle` props (e.g. "Document" + "= Copilot").
 * Underline variant uses children (e.g. "Overview") and optional `count`.
 */
export function TabsTrigger({ value, count, title, subtitle, className, children }: TabsTriggerProps) {
	const { value: active, onValueChange, variant } = useTabsCtx('TabsTrigger');
	const isActive = active === value;

	if (variant === 'segment') {
		return (
			<button
				type="button"
				role="tab"
				aria-selected={isActive}
				onClick={() => onValueChange(value)}
				className={cn(
					'pktw-flex pktw-flex-col pktw-items-center pktw-gap-0.5 pktw-py-4 pktw-px-3 pktw-text-center pktw-bg-transparent pktw-border-0 pktw-border-b-2 pktw-border-transparent pktw-cursor-pointer pktw-transition-colors',
					isActive
						? 'pktw-text-pk-accent pktw-border-pk-accent pktw-bg-pk-accent-tint'
						: 'pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground hover:pktw-bg-pk-state-hover active:pktw-bg-pk-state-active',
					className,
				)}
			>
				<span className={cn('pktw-text-sm', isActive ? 'pktw-font-bold' : 'pktw-font-semibold')}>{title ?? children}</span>
				{subtitle ? (
					<span className={cn('pktw-text-pk-sm', isActive ? 'pktw-text-pk-accent-text pktw-opacity-80' : 'pktw-text-pk-foreground-faint')}>
						{subtitle}
					</span>
				) : null}
			</button>
		);
	}

	return (
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			onClick={() => onValueChange(value)}
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-pb-3 pktw-pt-2 pktw--mb-px pktw-bg-transparent pktw-border-0 pktw-border-b-2 pktw-border-transparent pktw-cursor-pointer pktw-transition-colors pktw-text-sm',
				isActive
					? 'pktw-text-pk-accent pktw-font-semibold pktw-border-pk-accent'
					: 'pktw-text-pk-foreground-muted pktw-font-medium hover:pktw-text-pk-foreground',
				className,
			)}
		>
			{children}
			{typeof count === 'number' ? (
				<Pill
					variant={isActive ? 'accent' : 'neutral'}
					size="sm"
					className="pktw-ml-1.5"
				>
					{count}
				</Pill>
			) : null}
		</button>
	);
}

export interface TabsPanelProps {
	value: string;
	className?: string;
	children?: React.ReactNode;
}

export function TabsPanel({ value, className, children }: TabsPanelProps) {
	const { value: active } = useTabsCtx('TabsPanel');
	if (active !== value) return null;
	return (
		<div role="tabpanel" className={className}>
			{children}
		</div>
	);
}
