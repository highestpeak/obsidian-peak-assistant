import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';

export interface TextStreamSection {
	key: string;
	label: string;
	count: number;
	/** When true, renders a small warning icon next to the section label. */
	warn?: boolean;
	items: Array<{
		title: string;
		subtitle?: string;
		onClick?: () => void;
	}>;
}

export interface TextStreamAction {
	label: string;
	variant?: 'primary' | 'ghost';
	icon?: LucideIcon;
	onClick: () => void;
}

export interface TextStreamPanelProps {
	icon?: LucideIcon;
	title: string;
	badge?: string;
	subtitle?: string;
	body: string;
	/** Visual treatment for the body text block. */
	bodyStyle?: 'callout' | 'left-bordered' | 'plain';
	sections?: TextStreamSection[];
	footerSummary?: string;
	actions: TextStreamAction[];
	onClose: () => void;
	showWordCount?: boolean;
}

/**
 * Shared "stream a long-form text result with optional collapsible
 * sources/gaps" panel body used by the Copilot text-stream actions
 * (Summarize / Synthesize / ContinueWriting / WriteArticle). Per-action
 * data shapes and side-effects stay in their thin wrappers.
 */
export const TextStreamPanel: React.FC<TextStreamPanelProps> = ({
	icon: Icon,
	title,
	badge,
	subtitle,
	body,
	bodyStyle = 'plain',
	sections = [],
	footerSummary,
	actions,
	onClose,
	showWordCount,
}) => {
	const wordCount = showWordCount ? body.split(/\s+/).filter(Boolean).length : null;

	const bodyClass = (() => {
		switch (bodyStyle) {
			case 'callout':
				return 'pktw-p-4 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap';
			case 'left-bordered':
				return 'pktw-border-l-3 pktw-border-l-accent pktw-pl-4 pktw-py-2 pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap';
			case 'plain':
			default:
				return 'pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap pktw-mb-4';
		}
	})();

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					{Icon && <Icon className="pktw-w-4 pktw-h-4" />}
					<span className="pktw-text-sm pktw-font-semibold">{title}</span>
					{badge && (
						<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
							{badge}
						</span>
					)}
				</div>
				{subtitle && <span className="pktw-text-[11px] pktw-text-muted-foreground">{subtitle}</span>}
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				<div className={bodyClass}>{body}</div>
				{wordCount !== null && (
					<div className="pktw-mt-2 pktw-text-[10px] pktw-text-muted-foreground">{wordCount} words</div>
				)}
				{sections.map((section, sIdx) => (
					<CollapsibleSection
						key={section.key}
						section={section}
						defaultOpen={false}
						isLast={sIdx === sections.length - 1}
					/>
				))}
			</div>

			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				{footerSummary && (
					<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">{footerSummary}</span>
				)}
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
				{actions.map((action, i) => {
					const { label, variant = 'primary', icon: ActionIcon, onClick } = action;
					return (
						<Button
							key={`${label}-${i}`}
							variant={variant === 'primary' ? undefined : 'ghost'}
							onClick={onClick}
							className={ActionIcon ? 'pktw-gap-1' : undefined}
						>
							{ActionIcon && <ActionIcon className="pktw-w-3.5 pktw-h-3.5" />}
							{label}
						</Button>
					);
				})}
			</div>
		</div>
	);
};

const CollapsibleSection: React.FC<{
	section: TextStreamSection;
	defaultOpen: boolean;
	isLast: boolean;
}> = ({ section, defaultOpen, isLast }) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div
			className={`pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden${isLast ? '' : ' pktw-mb-2.5'}`}
		>
			<div
				className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
				onClick={() => setOpen(prev => !prev)}
			>
				{open
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
				}
				{section.warn && <AlertTriangle className="pktw-w-3 pktw-h-3 pktw-text-[var(--pk-warning)]" />}
				<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
					{section.label} ({section.count})
				</span>
			</div>
			{open && (
				<div className="pktw-px-3.5 pktw-py-2">
					{section.items.map((item, i) => (
						<div
							key={i}
							className={`pktw-flex pktw-items-start pktw-gap-2 pktw-py-1.5 pktw-transition-colors pktw-group${item.onClick ? ' pktw-cursor-pointer hover:pktw-text-accent' : ''}`}
							onClick={item.onClick}
						>
							<span className="pktw-text-[10px] pktw-text-muted-foreground/40 pktw-w-4 pktw-text-right pktw-flex-shrink-0">{i + 1}</span>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-flex pktw-items-center pktw-gap-1.5">
									<span className="pktw-text-[12px] pktw-text-accent pktw-truncate">{item.title}</span>
									{item.onClick && (
										<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-flex-shrink-0" />
									)}
								</div>
								{item.subtitle && (
									<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-block pktw-mt-0.5">
										{item.subtitle}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};
