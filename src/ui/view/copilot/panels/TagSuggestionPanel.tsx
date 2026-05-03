import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { writeTagsToFrontmatter } from '@/service/copilot/frontmatterTagWriter';
import type { TagSuggestions } from '@/service/copilot/copilot-schemas';
import { Check, X, Pencil, Tag } from 'lucide-react';

type TagStatus = 'pending' | 'accepted' | 'rejected';

interface TagSuggestionPanelProps {
  result: TagSuggestions;
  file: TFile;
  onClose: () => void;
}

const CONFIDENCE_TIERS = [
  { label: 'High Confidence', min: 0.7, max: 1 },
  { label: 'Medium Confidence', min: 0.4, max: 0.7 },
  { label: 'Low Confidence', min: 0, max: 0.4 },
] as const;

export const TagSuggestionPanel: React.FC<TagSuggestionPanelProps> = ({
  result, file, onClose,
}) => {
  const [statuses, setStatuses] = useState<Record<string, TagStatus>>(() => {
    const init: Record<string, TagStatus> = {};
    for (const s of result.suggestions) init[s.tag] = 'pending';
    return init;
  });
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const setTagStatus = (tag: string, status: TagStatus) => {
    setStatuses(prev => ({ ...prev, [tag]: status }));
  };

  const startEdit = (tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  };

  const confirmEdit = (originalTag: string) => {
    const newTag = editValue.trim().replace(/^#/, '');
    if (!newTag) { setEditingTag(null); return; }
    if (newTag !== originalTag) {
      setStatuses(prev => {
        const next = { ...prev };
        delete next[originalTag];
        next[newTag] = 'accepted';
        return next;
      });
      // Update the suggestion in-place for display
      const s = result.suggestions.find(s => s.tag === originalTag);
      if (s) s.tag = newTag;
    } else {
      setTagStatus(originalTag, 'accepted');
    }
    setEditingTag(null);
  };

  const acceptedTags = Object.entries(statuses)
    .filter(([, s]) => s === 'accepted')
    .map(([tag]) => tag);

  const handleApply = async () => {
    try {
      await writeTagsToFrontmatter(file, acceptedTags);
      new Notice(`Added ${acceptedTags.length} tag${acceptedTags.length > 1 ? 's' : ''} to frontmatter.`);
      onClose();
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <Tag className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Tag Suggestions</span>
        </div>
        <span className="pktw-text-[11px] pktw-text-muted-foreground">{file.basename}</span>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {result.suggestions.length === 0 ? (
          <div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
            This document appears well-tagged. No additional tags suggested.
          </div>
        ) : (
          CONFIDENCE_TIERS.map(tier => {
            const tierSuggestions = result.suggestions.filter(
              s => s.confidence >= tier.min && s.confidence < tier.max,
            );
            if (tierSuggestions.length === 0) return null;
            return (
              <div key={tier.label} className="pktw-mb-4">
                <span className="pktw-text-[10px] pktw-font-bold pktw-uppercase pktw-text-muted-foreground pktw-tracking-wider">
                  {tier.label}
                </span>
                <div className="pktw-mt-1.5 pktw-space-y-1">
                  {tierSuggestions.map(suggestion => {
                    const status = statuses[suggestion.tag] ?? 'pending';
                    const isEditing = editingTag === suggestion.tag;
                    return (
                      <div
                        key={suggestion.tag}
                        className={`pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-transition-colors ${
                          status === 'accepted' ? 'pktw-bg-[var(--pk-success,#22c55e)]/5' :
                          status === 'rejected' ? 'pktw-bg-muted/50 pktw-opacity-50' :
                          'hover:pktw-bg-muted'
                        }`}
                      >
                        <div className="pktw-flex-1 pktw-min-w-0">
                          <div className="pktw-flex pktw-items-center pktw-gap-1.5">
                            {isEditing ? (
                              <div className="pktw-flex pktw-items-center pktw-gap-1">
                                <span className="pktw-text-[13px] pktw-text-muted-foreground">#</span>
                                <input
                                  className="pktw-text-[13px] pktw-bg-transparent pktw-border-b pktw-border-accent pktw-outline-none pktw-font-semibold pktw-w-40"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') confirmEdit(suggestion.tag);
                                    if (e.key === 'Escape') setEditingTag(null);
                                  }}
                                  autoFocus
                                />
                                <Button variant="ghost" size="sm" className="pktw-h-5 pktw-w-5 pktw-p-0" onClick={() => confirmEdit(suggestion.tag)}>
                                  <Check className="pktw-w-3 pktw-h-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent">#{suggestion.tag}</span>
                                <span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${
                                  suggestion.category === 'topic' ? 'pktw-bg-accent/10 pktw-text-accent' :
                                  suggestion.category === 'keyword' ? 'pktw-bg-blue-500/10 pktw-text-blue-500' :
                                  'pktw-bg-orange-500/10 pktw-text-orange-500'
                                }`}>
                                  {suggestion.category}
                                </span>
                                <span className="pktw-text-[10px] pktw-text-muted-foreground/60">
                                  {Math.round(suggestion.confidence * 100)}%
                                </span>
                              </>
                            )}
                          </div>
                          <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">
                            {suggestion.reason}
                          </span>
                        </div>

                        {/* Actions */}
                        {!isEditing && (
                          <div className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-flex-shrink-0">
                            <Button
                              variant="ghost" size="sm"
                              className={`pktw-h-6 pktw-w-6 pktw-p-0 ${status === 'accepted' ? 'pktw-text-[var(--pk-success,#22c55e)]' : ''}`}
                              onClick={() => setTagStatus(suggestion.tag, status === 'accepted' ? 'pending' : 'accepted')}
                            >
                              <Check className="pktw-w-3.5 pktw-h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className={`pktw-h-6 pktw-w-6 pktw-p-0 ${status === 'rejected' ? 'pktw-text-destructive' : ''}`}
                              onClick={() => setTagStatus(suggestion.tag, status === 'rejected' ? 'pending' : 'rejected')}
                            >
                              <X className="pktw-w-3.5 pktw-h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="pktw-h-6 pktw-w-6 pktw-p-0"
                              onClick={() => startEdit(suggestion.tag)}
                            >
                              <Pencil className="pktw-w-3.5 pktw-h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {acceptedTags.length} of {result.suggestions.length} accepted
        </span>
        <Button variant="ghost" onClick={onClose}>Skip All</Button>
        <Button onClick={handleApply} disabled={acceptedTags.length === 0}>
          Apply {acceptedTags.length} Tag{acceptedTags.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
};
