import * as React from 'react';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

export interface InsertTypeMenuProps {
	className?: string;
	onSelect(typeId: string): void;
}

/**
 * One template-driven insert-type rail shared by the explicit block action and
 * the pointer-relative between-block entry.
 */
export function InsertTypeMenu({
	className,
	onSelect,
}: InsertTypeMenuProps): React.ReactElement {
	const config = useComposerChrome().config.chrome.insertDraft;
	const classes = ['pk-insert-type-menu', className].filter(Boolean).join(' ');
	return (
		<div className={classes} role="menu" aria-label={config.chooserLabel}>
			{config.types.map((type) => (
				<Button
					key={type.id}
					type="button"
					variant="ghost"
					size="sm"
					className="pk-action-capsule pk-insert-type-menu__item"
					role="menuitem"
					data-default={type.default || undefined}
					onClick={() => onSelect(type.id)}
				>
					{type.label}
				</Button>
			))}
		</div>
	);
}
