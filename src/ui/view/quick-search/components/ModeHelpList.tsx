import React from 'react';
import { Search, Hash, HelpCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface ModeItem {
	prefix: string;
	name: string;
	description: string;
	icon: React.ElementType;
}

const MODES: ModeItem[] = [
	{ prefix: '', name: 'Vault', description: 'Search all notes by title, content, and path', icon: Search },
	{ prefix: '#', name: 'Heading', description: 'Outline the active file and jump to a heading', icon: Hash },
	{ prefix: '?', name: 'Help', description: 'Show all available search modes', icon: HelpCircle },
];

export const MODE_COUNT = MODES.length;

interface OperatorItem {
	prefix: string;
	description: string;
}

const OPERATORS: OperatorItem[] = [
	{ prefix: '"..."', description: 'Exact phrase match' },
	{ prefix: '-word', description: 'Exclude results containing word' },
	{ prefix: 'tag:value', description: 'Filter by tag' },
	{ prefix: 'ext:pdf', description: 'Filter by file type' },
];

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
							isSelected ? 'pktw-bg-pk-highlight' : 'hover:pktw-bg-pk-surface-raised'
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
							isSelected ? 'pktw-bg-pk-accent' : 'pktw-bg-pk-surface-sunken'
						)}>
							<Icon className={cn(
								'pktw-w-3.5 pktw-h-3.5',
								isSelected ? 'pktw-text-pk-text-inverted' : 'pktw-text-pk-foreground-muted'
							)} />
						</div>
						{/* Text */}
						<div className="pktw-flex pktw-flex-col pktw-flex-1 pktw-min-w-0">
							<span className={cn(
								'pktw-text-sm pktw-font-medium pktw-leading-tight',
								isSelected ? 'pktw-text-pk-accent' : 'pktw-text-pk-text-primary'
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
									? 'pktw-bg-pk-accent-muted pktw-text-pk-accent pktw-border-pk-accent/30'
									: 'pktw-bg-pk-surface-raised pktw-text-pk-foreground-muted pktw-border-pk-border'
							)}>
								{mode.prefix}
							</span>
						)}
					</div>
				);
			})}

			{/* Query syntax operators section */}
			<div className="pktw-px-4 pktw-pt-3 pktw-pb-1">
				<span className="pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-pk-foreground-muted">
					Query Operators
				</span>
			</div>
			{OPERATORS.map((op) => (
				<div
					key={op.prefix}
					className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-1.5"
				>
					<span className="pktw-flex-shrink-0 pktw-text-[11px] pktw-font-mono pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-border pktw-bg-pk-surface-raised pktw-text-pk-foreground-muted pktw-border-pk-border">
						{op.prefix}
					</span>
					<span className="pktw-text-[11px] pktw-text-pk-foreground-muted">
						{op.description}
					</span>
				</div>
			))}
		</div>
	);
};
