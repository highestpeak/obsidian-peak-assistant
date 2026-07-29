/**
 * Peak Composer — Code Block read-only view (WP8, §7.4 / §10.11).
 *
 * Code only shows/edits code — rich inline formatting is suppressed (that is the
 * WP4 chrome's job; this view never renders styled runs). The body is the
 * verbatim fenced source with newlines/indentation/tabs intact, carrying
 * `data-src-text-from` so cross-structure selection maps to source offsets. A
 * language badge is the only affordance; copy/AI live in the shared action row.
 */

import * as React from 'react';
import { Code2, Sparkles } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { CODE_EXPLAIN_CAPABILITY_ID, parseCodeFence } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { NativeBlockFrame, NativeSourceView, useNativeStrings, type NativeViewMode } from '../nativeBlockShared';

export function CodeBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const raw = block.renderModel.raw;
	const fence = React.useMemo(() => parseCodeFence(raw), [raw]);
	const language = fence?.language || block.renderModel.language || '';
	const strings = useNativeStrings();
	const chrome = useComposerChrome();
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const title = fenceTitle(fence?.info ?? '', language, strings.codeSourceTitle);
	const body = fence?.body ?? raw;
	const bodyFrom = fence ? block.source.from + raw.indexOf('\n') + 1 : block.source.from;
	const snapshot = React.useMemo(() => ({
		documentId: chrome.snapshot?.documentId ?? '',
		revision: chrome.snapshot?.revision ?? block.source.revision,
		target: { kind: 'block' as const, blockId: block.blockId },
		targetSource: chrome.snapshot?.sourceText.slice(block.source.from, block.source.to) ?? raw,
	}), [chrome.snapshot, block.blockId, block.source.from, block.source.to, block.source.revision, raw]);
	const explainAction = chrome.projection.actionsFor(snapshot, 'block-row').find((action) => action.capabilityId === CODE_EXPLAIN_CAPABILITY_ID && !action.disabledReason);
	const explain = explainAction
		? () => chrome.projection.invoke(explainAction.capabilityId, snapshot, { instruction: strings.explainSourceInstruction })
		: undefined;
	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			showToggle={false}
			icon={<Code2 size={17} />}
			kindLabel={language ? language.toUpperCase() : strings.codeLabel}
			title={title}
			headerAction={(
				<Button variant="outline" size="sm" disabled={!explain} className="pk-native-code__explain" onClick={explain}>
					<Sparkles size={13} />
					<span>{strings.explainSource}</span>
				</Button>
			)}
		>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={block.source.from} />
			) : (
				<div className="pk-native-code" data-lang={language || undefined}>
					<pre className="pk-composer-mono pk-native-code__body" data-src-text-from={bodyFrom} data-block-id={block.blockId}>
						{body}
					</pre>
				</div>
			)}
		</NativeBlockFrame>
	);
}

function fenceTitle(info: string, language: string, fallback: string): string {
	const rest = info.split(/\s+/).slice(language ? 1 : 0).join(' ').trim();
	if (rest) return rest;
	return fallback;
}
