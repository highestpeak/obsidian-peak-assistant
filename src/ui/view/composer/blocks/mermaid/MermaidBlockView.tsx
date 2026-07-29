/**
 * Peak Composer — Mermaid block view (WP8, §10.11).
 *
 * Header carries ONLY the `预览 / 源码` toggle (copy source/image and AI edit
 * live in the shared flattened action row, never duplicated here). Preview mode
 * lazy-loads the `mermaid` package and renders the diagram to SVG; source mode
 * shows the verbatim ```mermaid slice for cross-structure selection mapping. A
 * render failure falls back to source with a reason (never a broken graphic).
 *
 * `mermaid` (~heavy) is imported dynamically on first preview so it never lands
 * in the initial chunk — the streamdown lazy-load precedent.
 */

import * as React from 'react';
import { Workflow } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { parseMermaidBlock } from '@/service/composer';
import { NativeBlockFrame, NativeSourceView, useNativeStrings, type NativeViewMode } from '../nativeBlockShared';

let mermaidSeq = 0;

export function MermaidBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const raw = block.renderModel.raw;
	const source = React.useMemo(() => parseMermaidBlock(raw)?.source ?? '', [raw]);

	if (mode === 'source') {
		return (
			<NativeBlockFrame
				blockId={block.blockId}
				sourceFrom={block.source.from}
				mode={mode}
				onMode={setMode}
				strings={strings}
				icon={<Workflow size={17} />}
				kindLabel={strings.mermaidLabel}
				title={diagramTitle(source, strings.mermaidTitle)}
			>
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={block.source.from} />
			</NativeBlockFrame>
		);
	}
	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			icon={<Workflow size={17} />}
			kindLabel={strings.mermaidLabel}
			title={diagramTitle(source, strings.mermaidTitle)}
		>
			<MermaidRender source={source} raw={raw} blockId={block.blockId} sourceFrom={block.source.from} strings={strings} />
		</NativeBlockFrame>
	);
}

function MermaidRender({
	source,
	raw,
	blockId,
	sourceFrom,
	strings,
}: {
	source: string;
	raw: string;
	blockId: string;
	sourceFrom: number;
	strings: ReturnType<typeof useNativeStrings>;
}): React.ReactElement {
	const hostRef = React.useRef<HTMLDivElement | null>(null);
	const [failed, setFailed] = React.useState(false);

	React.useEffect(() => {
		if (!source.trim()) return;
		let alive = true;
		const host = hostRef.current;
		if (!host) return;
		void renderMermaid(host, source)
			.then(() => {
				if (alive) setFailed(false);
			})
			.catch(() => {
				if (alive) setFailed(true);
			});
		return () => {
			alive = false;
		};
	}, [source]);

	if (!source.trim()) return <div className="pk-native-empty">{strings.mermaidEmpty}</div>;
	if (failed) {
		return (
			<div className="pk-native-mermaid pk-native-mermaid--failed">
				<span className="pk-native-empty">{strings.mermaidRenderError}</span>
				<NativeSourceView raw={raw} blockId={blockId} sourceFrom={sourceFrom} />
			</div>
		);
	}
	return <div ref={hostRef} className="pk-native-mermaid" role="img" aria-label="Mermaid diagram" />;
}

async function renderMermaid(host: HTMLElement, source: string): Promise<void> {
	const mod = (await import('mermaid')) as unknown as { default: MermaidApi } | MermaidApi;
	const mermaid: MermaidApi = 'default' in mod ? mod.default : mod;
	const dark = detectDark(host);
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: dark ? 'dark' : 'base',
		themeVariables: dark ? undefined : {
			primaryColor: '#f0edff',
			primaryBorderColor: '#8067df',
			primaryTextColor: '#20283a',
			lineColor: '#5c6472',
			secondaryColor: '#f8f9fc',
		},
	});
	mermaidSeq += 1;
	const id = `pk-composer-mermaid-${mermaidSeq}`;
	const { svg } = await mermaid.render(id, source);
	host.innerHTML = svg;
}

function diagramTitle(source: string, fallback: string): string {
	const token = source.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
	if (!token) return fallback;
	return `${fallback} · ${token.replace(/-v\d+$/, '')}`;
}

function detectDark(host: HTMLElement): boolean {
	const doc = host.ownerDocument;
	return doc?.body?.classList.contains('theme-dark') ?? false;
}

interface MermaidApi {
	initialize(config: Record<string, unknown>): void;
	render(id: string, text: string): Promise<{ svg: string }>;
}
