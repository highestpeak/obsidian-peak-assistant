/**
 * Free-form input for "regenerate with a note". The text is appended to the
 * curator prompt on the next invocation so the LLM can adjust.
 *
 * User-visible copy lives in `templates/config/onboarding.json` (key
 * `steps.redoInput`).
 */

import React from 'react';
import { ChevronLeft, Wand2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useOnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface RedoInputStepProps {
    note: string;
    onNoteChange: (note: string) => void;
    onBack: () => void;
    onSubmit: () => void;
}

export function RedoInputStep({ note, onNoteChange, onBack, onSubmit }: RedoInputStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.redoInput;
    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-4 pktw-px-8">
            <div className="pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-base pktw-font-semibold pktw-text-[--text-normal]">
                    {copy.title}
                </span>
                <span className="pktw-text-xs pktw-text-[--text-muted]">
                    {copy.description}
                </span>
            </div>

            <textarea
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder={copy.placeholder}
                rows={4}
                className="pktw-w-full pktw-bg-[--background-primary] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-md pktw-px-3 pktw-py-2 pktw-text-sm pktw-text-[--text-normal] focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-[--interactive-accent] pktw-resize-none"
            />

            <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
                {copy.presets.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onNoteChange(note ? `${note}\n${p}` : p)}
                        className="pktw-text-[11px] pktw-px-2 pktw-py-1 pktw-rounded-full pktw-border pktw-border-[--background-modifier-border] pktw-text-[--text-muted] hover:pktw-bg-[--background-modifier-hover]"
                    >
                        + {p}
                    </button>
                ))}
            </div>

            <div className="pktw-flex pktw-justify-between pktw-pt-1">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1 pktw-text-xs">
                    <ChevronLeft size={14} /> {strings.actions.back}
                </Button>
                <Button size="sm" onClick={onSubmit} disabled={!note.trim()} className="pktw-gap-1">
                    <Wand2 size={14} /> {copy.submitCta}
                </Button>
            </div>
        </div>
    );
}
