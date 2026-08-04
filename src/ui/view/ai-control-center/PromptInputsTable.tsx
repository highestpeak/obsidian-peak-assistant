import React from 'react';
import type { AIControlPromptInput } from '@/core/ports/AIControlCenterPort';

/** One uninterrupted, one-field-per-row explanation of the prompt context. */
export function PromptInputsTable({ inputs }: { inputs: readonly AIControlPromptInput[] }): React.ReactElement {
	if (inputs.length === 0) return <div className="pktw-border-t pktw-border-pk-border pktw-px-4 pktw-py-3 pktw-text-xs pktw-text-pk-text-tertiary">This prompt has no runtime fields.</div>;
	return <div className="pktw-border-t pktw-border-pk-border"><div className="pktw-grid pktw-grid-cols-[220px_minmax(0,1fr)] pktw-border-b pktw-border-pk-border pktw-bg-pk-surface-muted pktw-px-4 pktw-py-2 pktw-text-xs pktw-font-medium"><span>Template field</span><span>What Peak supplies</span></div>{inputs.map((input) => <div key={input.name} className="pktw-grid pktw-grid-cols-[220px_minmax(0,1fr)] pktw-border-b pktw-border-pk-border last:pktw-border-b-0 pktw-px-4 pktw-py-2.5 pktw-text-xs"><code className="pktw-pr-3 pktw-text-pk-accent">{'{{'}{input.name}{'}}'}</code><span className="pktw-leading-5 pktw-text-pk-text-secondary">{input.description}</span></div>)}</div>;
}
