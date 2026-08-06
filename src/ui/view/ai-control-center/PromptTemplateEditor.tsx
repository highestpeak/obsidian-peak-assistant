import React, { useLayoutEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { buildPromptRevisionRequest, splitHandlebarsTemplate } from './handlebarsTemplate';

export interface PromptTemplateEditorProps {
	label: string;
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
}

/**
 * Keeps native textarea editing (selection, paste and resize) while presenting
 * the same source through a synchronized Handlebars-highlighted layer.
 */
export function PromptTemplateEditor({ label, ariaLabel, value, onChange }: PromptTemplateEditorProps): React.ReactElement {
	const highlightsRef = useRef<HTMLPreElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [copied, setCopied] = useState(false);

	const syncHighlights = (target: HTMLTextAreaElement): void => {
		if (!highlightsRef.current) return;
		highlightsRef.current.scrollTop = target.scrollTop;
		highlightsRef.current.scrollLeft = target.scrollLeft;
	};

	useLayoutEffect(() => {
		if (textareaRef.current) syncHighlights(textareaRef.current);
	}, [value]);
	const copyForAI = async (): Promise<void> => {
		if (!value.trim()) return;
		try {
			await navigator.clipboard.writeText(buildPromptRevisionRequest(value));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			setCopied(false);
		}
	};

	return <div className="pktw-flex pktw-flex-col pktw-gap-2">
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3">
			<span className="pktw-text-xs pktw-font-medium">{label}</span>
			<Button size="sm" variant="secondary" disabled={!value.trim()} onClick={() => void copyForAI()}>
				{copied ? <Check size={14} /> : <Sparkles size={14} />}
				{copied ? 'Copied for AI' : 'Copy for AI'}
			</Button>
		</div>
		<div className="pk-ai-control-center__handlebars-help">
			<span><strong>Handlebars template.</strong> Purple <code>{'{{fields}}'}</code> are filled by Peak when this action runs—keep them intact. Copy this template into Chat to ask AI to rewrite or polish it.</span>
		</div>
		<div className="pk-ai-control-center__template-editor">
			<pre ref={highlightsRef} className="pk-ai-control-center__template-highlights" aria-hidden="true"><code>{splitHandlebarsTemplate(value).map((segment, index) => segment.isHandlebars ? <mark key={index} className="pk-ai-control-center__handlebars-token">{segment.value}</mark> : <React.Fragment key={index}>{segment.value}</React.Fragment>)}</code></pre>
			<textarea
				ref={textareaRef}
				aria-label={ariaLabel}
				rows={28}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={(event) => syncHighlights(event.currentTarget)}
				className="pk-ai-control-center__prompt-textarea pk-ai-control-center__template-textarea pktw-w-full pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-p-3 pktw-font-mono pktw-text-xs pktw-text-pk-text-primary"
			/>
		</div>
	</div>;
}
