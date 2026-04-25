import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { MatchedSuggestion } from '@/service/context/PatternMatcher';

// ---------------------------------------------------------------------------
// SuggestionCard
// ---------------------------------------------------------------------------

const SuggestionCard: React.FC<{
	suggestion: MatchedSuggestion;
	onSelect: (suggestion: MatchedSuggestion) => void;
}> = ({ suggestion, onSelect }) => {
	const { actionLabel, filledTemplate, contextTags } = suggestion;
	// Context = everything after the action prefix
	const context = filledTemplate.startsWith(actionLabel)
		? filledTemplate.slice(actionLabel.length).trim()
		: filledTemplate;
	const scopeTag = contextTags[0] ?? null;

	return (
		<div
			onClick={() => onSelect(suggestion)}
			className={cn(
				'pktw-flex pktw-flex-col pktw-gap-2 pktw-p-3.5 pktw-border pktw-border-pk-border pktw-rounded-lg',
				'pktw-bg-pk-background hover:pktw-border-[#7c3aed]/40 hover:pktw-bg-[#f5f3ff]',
				'pktw-cursor-pointer pktw-transition-all pktw-group',
			)}
		>
			<span className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground pktw-leading-snug group-hover:pktw-text-pk-accent pktw-transition-colors">
				{actionLabel}
			</span>
			{context && (
				<span className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-relaxed pktw-line-clamp-2">
					{context}
				</span>
			)}
			{scopeTag && (
				<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10px] pktw-font-mono pktw-text-pk-accent pktw-bg-[#ede9fe] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-w-fit">
					{scopeTag}
				</span>
			)}
		</div>
	);
};

// ---------------------------------------------------------------------------
// SuggestionGrid
// ---------------------------------------------------------------------------

export interface SuggestionGridProps {
    suggestions: MatchedSuggestion[];
    onSelect: (suggestion: MatchedSuggestion) => void;
}

export const SuggestionGrid: React.FC<SuggestionGridProps> = ({ suggestions, onSelect }) => {
    if (suggestions.length === 0) return null;

    return (
        <div>
            <span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-pk-foreground-muted pktw-mb-2">
                Suggested for you
            </span>
            <div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
                {suggestions.map((s) => (
                    <SuggestionCard key={s.patternId} suggestion={s} onSelect={onSelect} />
                ))}
            </div>
        </div>
    );
};
