import React from 'react';

interface KeyboardShortcutProps {
	/** The keyboard key(s) to display */
	keys: string;
	/** Description text after the key */
	description: string;
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
		<kbd className="pktw-px-1.5 pktw-py-0.5 pktw-bg-white pktw-border pktw-border-[#d1d5db] pktw-rounded pktw-text-[#6c757d]">
			{keys}
		</kbd>
		{' '}{description}
		{warning && <span className="pktw-text-[#f59e0b] pktw-ml-1">{warning}</span>}
	</span>
);

