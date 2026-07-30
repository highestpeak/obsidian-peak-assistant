import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { MatchedSuggestion } from '@/service/context/PatternMatcher';
import { Button } from '@/ui/component/shared-ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap quoted segments (「…」, "…", '…') in highlighted spans. */
function highlightVariables(text: string): React.ReactNode[] {
    const parts = text.split(/(「[^」]+」|"[^"]+"|'[^']+')/g);
    return parts.map((part, i) => {
        if (/^[「"']/.test(part)) {
            return (
                <span
                    key={i}
                    className="pktw-bg-pk-warning-muted pktw-text-pk-warning pktw-px-0.5 pktw-rounded-sm"
                >
                    {part}
                </span>
            );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

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
		<Button
			variant="unstyled"
			onClick={() => onSelect(suggestion)}
			className={cn(
				'!pktw-h-auto !pktw-min-h-[88px] !pktw-max-h-none pktw-w-full pktw-items-start pktw-justify-start pktw-flex-col pktw-gap-2 !pktw-p-3.5 pktw-border pktw-border-pk-border pktw-rounded-lg pktw-text-left pktw-whitespace-normal',
				'pktw-bg-pk-background hover:pktw-border-pk-accent/40 hover:pktw-bg-pk-accent-tint',
				'pktw-cursor-pointer pktw-transition-all pktw-group',
			)}
		>
			<span className="pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground pktw-leading-snug group-hover:pktw-text-pk-accent pktw-transition-colors">
				{actionLabel}
			</span>
			{context && (
				<span className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-relaxed pktw-line-clamp-2">
					{highlightVariables(context)}
				</span>
			)}
			{scopeTag && (
				<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-xs pktw-font-mono pktw-text-pk-accent pktw-bg-pk-accent-soft pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-w-fit">
					{scopeTag}
				</span>
			)}
		</Button>
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
        <div className="pktw-px-4">
            <span className="pktw-block pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-mb-2">
                Suggested from current context
            </span>
            <div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
                {suggestions.map((s) => (
                    <SuggestionCard key={s.patternId} suggestion={s} onSelect={onSelect} />
                ))}
            </div>
        </div>
    );
};
