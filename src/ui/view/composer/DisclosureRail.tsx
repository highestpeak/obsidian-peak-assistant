import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';

/**
 * Structural disclosure rail (WP1 scope = the fold chevron only; the matched
 * drag handle lands in WP4). Chevron direction follows handoff §6.3: expanded
 * shows an up chevron (click to collapse), collapsed shows a down chevron
 * (click to expand). Icon-only, so it goes through the `IconButton` primitive
 * with a required aria-label.
 */
export interface DisclosureRailProps {
	folded: boolean;
	label: string;
	onToggle: () => void;
}

export function DisclosureRail({ folded, label, onToggle }: DisclosureRailProps): React.ReactElement {
	const Icon = folded ? ChevronDown : ChevronUp;
	return (
		<div className="pk-composer-rail" aria-hidden={false}>
			<IconButton
				label={label}
				aria-expanded={!folded}
				className="pk-composer-disclosure"
				onClick={onToggle}
			>
				<Icon size={15} strokeWidth={2} />
			</IconButton>
		</div>
	);
}
