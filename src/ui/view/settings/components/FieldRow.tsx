import * as React from 'react';

export interface FieldRowProps {
	label: string;
	children: React.ReactNode;
	/**
	 * Width of the label column. Call sites currently differ (ProfilesTab uses
	 * 160px, ProfileCard / MCPServerCard use 130px) — kept parameterized until
	 * the settings label-column width is unified by design.
	 */
	labelWidth?: string;
}

/**
 * Shared two-column (label · control) settings row. Extracted from the three
 * identical local `FieldRow` copies in ProfilesTab / ProfileCard / MCPServerCard.
 */
export function FieldRow({ label, children, labelWidth = '130px' }: FieldRowProps) {
	return (
		<div className="pktw-grid pktw-items-center pktw-gap-3" style={{ gridTemplateColumns: `${labelWidth} 1fr` }}>
			<span className="pktw-text-xs pktw-text-pk-foreground-faint">{label}</span>
			{children}
		</div>
	);
}
