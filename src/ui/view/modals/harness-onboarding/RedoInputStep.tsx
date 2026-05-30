/**
 * Free-form input for "regenerate with a note". The text is appended to the
 * curator prompt on the next invocation so the LLM can adjust.
 *
 * Visual: FormRow.Textarea + a row of <Pill> presets that append to the note.
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { FormGrid, FormRow, Pill } from '@/ui/components/primitives';
import { useOnboardingStrings } from '@/ui/view/onboarding/onboardingStrings';

export interface RedoInputStepProps {
    note: string;
    onNoteChange: (note: string) => void;
    onBack: () => void;
    onSubmit: () => void;
}

export function RedoInputStep({ note, onNoteChange }: RedoInputStepProps) {
    const strings = useOnboardingStrings();
    const copy = strings.steps.redoInput;
    return (
        <div className="pkonb-section">
            <div>
                <div className="pkonb-section__title">{copy.title}</div>
                <div className="pkonb-section__desc">{copy.description}</div>
            </div>

            <FormGrid>
                <FormRow stack>
                    <FormRow.Control>
                        <FormRow.Textarea
                            value={note}
                            onChange={(e) => onNoteChange(e.target.value)}
                            placeholder={copy.placeholder}
                            rows={4}
                        />
                    </FormRow.Control>
                </FormRow>
            </FormGrid>

            <div className="pkonb-preset-row">
                {copy.presets.map((p) => (
                    <Pill
                        key={p}
                        onClick={() => onNoteChange(note ? `${note}\n${p}` : p)}
                    >
                        <Plus />
                        <span>{p}</span>
                    </Pill>
                ))}
            </div>
        </div>
    );
}
