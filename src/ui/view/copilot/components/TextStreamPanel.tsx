import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { CopilotPanelShell, type CopilotPanelAction } from './CopilotPanelShell';

export interface TextStreamSection {
	key: string;
	label: string;
	count: number;
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
	bodyStyle?: 'callout' | 'left-bordered' | 'plain';
	sections?: TextStreamSection[];
	footerSummary?: string;
	actions: TextStreamAction[];
	onClose: () => void;
	showWordCount?: boolean;
}

const bodyClassFor = (bodyStyle: 'callout' | 'left-bordered' | 'plain'): string => {
	if (bodyStyle === 'callout') {
		return 'pktw-p-4 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-pk-md pktw-leading-relaxed pktw-whitespace-pre-wrap';
	}
	if (bodyStyle === 'left-bordered') {
		return 'pktw-border-l-3 pktw-border-l-accent pktw-pl-4 pktw-py-2 pktw-text-pk-md pktw-leading-relaxed pktw-whitespace-pre-wrap';
	}
	return 'pktw-text-pk-md pktw-leading-relaxed pktw-whitespace-pre-wrap pktw-mb-4';
};

/**
 * Long-form text result panel (Summarize / Synthesize / ContinueWriting /
 * WriteArticle). Reuses the shared CopilotPanelShell for chrome and adds
 * the streaming-body + collapsible-sources/gaps body parts unique to this
 * family.
 */
export const TextStreamPanel: React.FC<TextStreamPanelProps> = ({
	icon,
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
	const shellActions: CopilotPanelAction[] = actions.map((a) => ({
		label: a.label,
		variant: a.variant === 'ghost' ? 'ghost' : 'primary',
		icon: a.icon,
		onClick: a.onClick,
	}));

	return (
		<CopilotPanelShell
			icon={icon}
			title={title}
			badge={badge}
			subtitle={subtitle}
			footerSummary={footerSummary}
			onClose={onClose}
			actions={shellActions}
		>
			<div className={bodyClassFor(bodyStyle)}>{body}</div>
			{wordCount !== null && (
				<div className="pktw-mt-2 pktw-text-pk-xs pktw-text-muted-foreground">{wordCount} words</div>
			)}
			{sections.map((section, sIdx) => (
				<CollapsibleSection
					key={section.key}
					section={section}
					defaultOpen={false}
					isLast={sIdx === sections.length - 1}
				/>
			))}
		</CopilotPanelShell>
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
				{section.warn && <AlertTriangle className="pktw-w-3 pktw-h-3 pktw-text-pk-warning" />}
				<span className="pktw-text-pk-sm pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">
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
							<span className="pktw-text-pk-xs pktw-text-muted-foreground/40 pktw-w-4 pktw-text-right pktw-flex-shrink-0">{i + 1}</span>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-flex pktw-items-center pktw-gap-1.5">
									<span className="pktw-text-pk-base pktw-text-accent pktw-truncate">{item.title}</span>
									{item.onClick && (
										<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-flex-shrink-0" />
									)}
								</div>
								{item.subtitle && (
									<span className="pktw-text-pk-xs pktw-text-muted-foreground/60 pktw-block pktw-mt-0.5">
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
