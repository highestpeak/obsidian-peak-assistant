import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface HelpAffordanceProps {
	/** Tooltip body — rendered via native `title` attribute for accessibility
	 *  parity with the mock. Can be promoted to a rich tooltip later. */
	tooltip: string;
	/** Override the glyph; defaults to ⓘ. */
	glyph?: React.ReactNode;
	className?: string;
	'aria-label'?: string;
}

/**
 * Help affordance — ⓘ glyph with a native tooltip, applies `.pk-help`
 * (scoped to `.peak-design-root.usage-dashboard`).
 *
 * Note: if chat / onboarding surfaces also need this, promote to
 * `peak-components.css` and `@/ui/components/primitives/` — leave this file
 * as a thin re-export then. Tracked in the brief as a PR-0.x candidate.
 */
export function HelpAffordance({
	tooltip,
	glyph = 'ⓘ',
	className,
	'aria-label': ariaLabel,
}: HelpAffordanceProps) {
	return (
		<span
			className={cn('pk-help', className)}
			title={tooltip}
			role="img"
			aria-label={ariaLabel ?? tooltip}
		>
			{glyph}
		</span>
	);
}
