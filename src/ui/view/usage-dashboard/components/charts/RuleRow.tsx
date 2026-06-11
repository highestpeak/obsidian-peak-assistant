import * as React from 'react';

export interface RuleRowProps {
	leading: React.ReactNode;
	title: React.ReactNode;
	sub?: React.ReactNode;
	trailing?: React.ReactNode;
	className?: string;
}

/**
 * Generic 3-column row used for Alert rules (toggle / title+sub / badge) AND
 * Model defaults (icon / title+sub / cost). Same grid spec as the mock's
 * `.rule` pattern.
 */
export function RuleRow({ leading, title, sub, trailing, className }: RuleRowProps) {
	return (
		<div className={joinClass('pk-rule', className)}>
			<div className="pk-rule__leading">{leading}</div>
			<div className="pk-rule__main">
				<span className="pk-rule__title">{title}</span>
				{sub ? <span className="pk-rule__sub">{sub}</span> : null}
			</div>
			{trailing ? <div className="pk-rule__trailing">{trailing}</div> : null}
		</div>
	);
}

function joinClass(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
