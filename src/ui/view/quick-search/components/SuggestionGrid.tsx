import React from 'react';
import {
    FileText,
    Link,
    FolderOpen,
    Tag,
    ArrowLeft,
    Clock,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { MatchedSuggestion } from '@/service/context/PatternMatcher';

// ---------------------------------------------------------------------------
// Context icon map
// ---------------------------------------------------------------------------

const CONTEXT_ICON: Record<MatchedSuggestion['contextType'], React.ElementType> = {
    activeDoc: FileText,
    outlinks: Link,
    folder: FolderOpen,
    tags: Tag,
    backlinks: ArrowLeft,
    recent: Clock,
    general: Sparkles,
};

// ---------------------------------------------------------------------------
// SuggestionCard
// ---------------------------------------------------------------------------

const SuggestionCard: React.FC<{
    suggestion: MatchedSuggestion;
    onSelect: (suggestion: MatchedSuggestion) => void;
}> = ({ suggestion, onSelect }) => {
    const Icon = CONTEXT_ICON[suggestion.contextType] ?? Sparkles;

    return (
        <div
            onClick={() => onSelect(suggestion)}
            className={cn(
                'pktw-flex pktw-flex-col pktw-gap-2 pktw-p-3',
                'pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-bg-white',
                'hover:pktw-border-[#7c3aed] hover:pktw-bg-[#f5f3ff]',
                'pktw-cursor-pointer pktw-transition-colors',
            )}
        >
            <div className="pktw-flex pktw-items-start pktw-gap-2">
                <span className="pktw-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded-md pktw-bg-[#7c3aed] pktw-shrink-0">
                    <Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-white" />
                </span>
                <span className="pktw-text-sm pktw-font-medium pktw-text-[#1f2937] pktw-line-clamp-2 pktw-leading-snug">
                    {suggestion.filledTemplate}
                </span>
            </div>
            {suggestion.contextTags.length > 0 && (
                <div className="pktw-flex pktw-flex-wrap pktw-gap-1">
                    {suggestion.contextTags.map((tag) => (
                        <span
                            key={tag}
                            className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-[#f3f4f6] pktw-text-[#6b7280]"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
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
            <span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-[#9ca3af] pktw-mb-2">
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
