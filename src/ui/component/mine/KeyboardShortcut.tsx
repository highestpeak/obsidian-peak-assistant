import React from 'react';

interface KeyboardShortcutProps {
	/** The keyboard key(s) to display */
	keys?: string;
	/** Description text after the key */
	description?: string;
	/** Optional prefix text before the key */
	prefix?: string;
	/** Optional warning message after description */
	warning?: string;
	/** Optional custom className */
	className?: string;
}

/**
 * Displays a keyboard shortcut hint with consistent styling.
 */
export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = ({
	keys,
	description,
	prefix,
	warning,
	className = '',
}) => (
	<span className={className || (warning ? 'pktw-flex pktw-items-center pktw-gap-1' : '')}>
		{prefix && <>{prefix}{' '}</>}
		{keys && (<kbd className="pktw-px-1.5 pktw-py-0.5 pktw-bg-pk-surface pktw-border pktw-border-pk-border-light pktw-rounded pktw-text-pk-text-secondary">
			{keys}
		</kbd>)}
		{description && (' ' + description)}
		{warning && <span className="pktw-text-pk-warning pktw-ml-1">{warning}</span>}
	</span>
);

