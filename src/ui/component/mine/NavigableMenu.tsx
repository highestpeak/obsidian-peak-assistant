import type React from 'react';

export interface NavigableMenuItem {
	id: string;
	label: string;
	description?: string;
	icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode);
	showArrow?: boolean;
	value: string;
	disabled?: boolean;
	group?: string;
	meta?: string;
}

export interface NavigableMenuProps {
	items: NavigableMenuItem[];
	onSelect: (item: NavigableMenuItem) => void;
	onClose: () => void;
	className?: string;
	maxHeight?: string;
	emptyMessage?: string;
	loadingMessage?: string;
	isLoading?: boolean;
}
