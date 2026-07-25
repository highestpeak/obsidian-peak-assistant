import * as React from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';

/**
 * Structural rail (WP4): matched 30×30 radius-md disclosure + drag handle
 * (component-consistency §4: "Top-level disclosure and drag are both 30×30,
 * same border, radius, icon weight and shadow"). Expanded shows an UP chevron
 * (向上收起); collapsed shows DOWN (向下展开). The drag handle starts a pointer
 * drag owned by the root (drop target rendering + moveBlock commit).
 */
export interface BlockRailProps {
	folded: boolean;
	foldLabel: string;
	dragLabel: string;
	onToggle: () => void;
	/** Absent ⇒ drag unavailable (no hub); the handle renders disabled + reason. */
	onDragStart?: (ev: React.PointerEvent<HTMLButtonElement>) => void;
	dragDisabledReason?: string;
}

export function BlockRail({
	folded,
	foldLabel,
	dragLabel,
	onToggle,
	onDragStart,
	dragDisabledReason,
}: BlockRailProps): React.ReactElement {
	const Icon = folded ? ChevronDown : ChevronUp;
	return (
		<div className="pk-composer-rail" data-chrome="true">
			<IconButton
				label={foldLabel}
				aria-expanded={!folded}
				className="pk-rail-control pk-composer-disclosure"
				onClick={onToggle}
			>
				<Icon size={15} strokeWidth={2} />
			</IconButton>
			<IconButton
				label={dragDisabledReason ? `${dragLabel} — ${dragDisabledReason}` : dragLabel}
				title={dragDisabledReason}
				className="pk-rail-control pk-composer-drag"
				disabled={!onDragStart}
				onPointerDown={onDragStart}
			>
				<GripVertical size={15} strokeWidth={2} />
			</IconButton>
		</div>
	);
}
