import * as React from 'react';
import type { InlineRun, InlineRunStyle } from '@/service/composer';

/**
 * Peak Composer — styled inline-run renderer (WP4.5 rich rendering).
 *
 * Paints the {@link InlineRun} projection produced by `parseInlineRuns` in the
 * NON-editing (blurred / read-only) state. Every run span carries its absolute
 * source offset (`data-src-text-from`) and the owning unit id (`data-unit-id`),
 * so DOM→source selection mapping stays exact even though the delimiters are
 * hidden (S2 mapping contract — the rendered visible text of each run equals the
 * contiguous source slice at `from`). Nothing here owns source truth: it is a
 * pure projection; all editing/patching runs against source coordinates.
 *
 * Link runs reuse the exact `.pk-composer-link` markup the editable leaf emits,
 * so the hover/keyboard link preview (LinkPreviewLayer) works identically in the
 * styled state.
 */
export function StyledRuns({ runs, unitId }: { runs: readonly InlineRun[]; unitId?: string }): React.ReactElement {
	return (
		<>
			{runs.map((run, i) => (
				<StyledRun key={`${run.from}-${i}`} run={run} unitId={unitId} />
			))}
		</>
	);
}

function StyledRun({ run, unitId }: { run: InlineRun; unitId?: string }): React.ReactElement {
	const { className, style } = styleAttrs(run.style);
	if (run.linkTarget) {
		return (
			<span
				className={className ? `pk-composer-link ${className}` : 'pk-composer-link'}
				style={style}
				data-src-text-from={run.from}
				data-unit-id={unitId}
				data-link-target={run.linkTarget}
				data-link-kind={run.linkKind}
				tabIndex={0}
			>
				{run.text}
			</span>
		);
	}
	return (
		<span className={className} style={style} data-src-text-from={run.from} data-unit-id={unitId}>
			{run.text}
		</span>
	);
}

/** Map a run style into a className (inline code) + inline CSS (weight/color/…). */
export function styleAttrs(s: InlineRunStyle): { className?: string; style?: React.CSSProperties } {
	const style: React.CSSProperties = {};
	if (s.bold) style.fontWeight = 700;
	if (s.italic) style.fontStyle = 'italic';
	const deco = [s.underline ? 'underline' : '', s.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
	if (deco) style.textDecoration = deco;
	if (s.color) style.color = s.color;
	if (s.highlight !== undefined) {
		style.backgroundColor = s.highlight || 'var(--text-highlight-bg)';
		style.borderRadius = '2px';
		style.padding = '0 1px';
	}
	const className = s.code ? 'pk-composer-inline-code' : undefined;
	const hasStyle = Object.keys(style).length > 0;
	return { ...(className ? { className } : {}), ...(hasStyle ? { style } : {}) };
}
