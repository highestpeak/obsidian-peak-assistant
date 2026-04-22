import React from 'react';
import { Search, Hash, FolderSearch, ListOrdered, HelpCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface ModeItem {
	prefix: string;
	name: string;
	description: string;
	icon: React.ElementType;
}

const MODES: ModeItem[] = [
	{ prefix: '', name: 'Vault', description: 'Search all notes by title, content, and path', icon: Search },
	{ prefix: '#', name: 'In-file', description: 'Search within the active file', icon: Hash },
	{ prefix: '@', name: 'In-folder', description: 'Search within the current folder', icon: FolderSearch },
	{ prefix: ':', name: 'Go to line', description: 'Jump to a line in the active file', icon: ListOrdered },
	{ prefix: '?', name: 'Help', description: 'Show all available search modes', icon: HelpCircle },
];

export const MODE_COUNT = MODES.length;

interface ModeHelpListProps {
	onSelectMode: (prefix: string) => void;
	selectedIndex: number;
	onSelectIndex: (index: number) => void;
}

export const ModeHelpList: React.FC<ModeHelpListProps> = ({ onSelectMode, selectedIndex, onSelectIndex }) => {
	return (
		<div className="pktw-py-1">
			{MODES.map((mode, i) => {
				const Icon = mode.icon;
				const isSelected = i === selectedIndex;
				return (
					<div
						key={mode.name}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-2.5 pktw-cursor-pointer pktw-relative pktw-transition-colors',
							isSelected ? 'pktw-bg-[#f5f3ff]' : 'hover:pktw-bg-[#fafafa]'
						)}
						onClick={() => onSelectMode(mode.prefix)}
						onMouseEnter={() => onSelectIndex(i)}
					>
						{/* Selected accent bar */}
						{isSelected && (
							<div className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-0.5 pktw-bg-pk-accent" />
						)}
						{/* Icon */}
						<div className={cn(
							'pktw-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex-shrink-0',
							isSelected ? 'pktw-bg-pk-accent' : 'pktw-bg-[#f0f0f0]'
						)}>
							<Icon className={cn(
								'pktw-w-3.5 pktw-h-3.5',
								isSelected ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted'
							)} />
						</div>
						{/* Text */}
						<div className="pktw-flex pktw-flex-col pktw-flex-1 pktw-min-w-0">
							<span className={cn(
								'pktw-text-sm pktw-font-medium pktw-leading-tight',
								isSelected ? 'pktw-text-pk-accent' : 'pktw-text-[#1f2937]'
							)}>
								{mode.name}
							</span>
							<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-leading-tight pktw-mt-0.5">
								{mode.description}
							</span>
						</div>
						{/* Prefix badge */}
						{mode.prefix && (
							<span className={cn(
								'pktw-flex-shrink-0 pktw-text-[11px] pktw-font-mono pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-border',
								isSelected
									? 'pktw-bg-[#ede9fe] pktw-text-pk-accent pktw-border-[#7c3aed]/30'
									: 'pktw-bg-[#f9f9f9] pktw-text-pk-foreground-muted pktw-border-pk-border'
							)}>
								{mode.prefix}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
};
