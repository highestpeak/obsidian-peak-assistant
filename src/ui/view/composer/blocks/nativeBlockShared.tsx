/**
 * Peak Composer — shared native block chrome (WP8). The `预览 / 源码` toggle,
 * the verbatim source view (newlines/indentation/tabs preserved), and the
 * strings hook every native preview component uses. Read-only: no editing chrome
 * here — the flattened action row (copy / AI edit) is owned by ComposerRoot.
 */

import * as React from 'react';
import type {
	ComposerNativePreviewPort,
	ComposerNativePreviewRequest,
	ComposerNativePreviewState,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import {
	DEFAULT_NATIVE_BLOCK_STRINGS,
	loadNativeBlockStrings,
	type NativeBlockStrings,
} from './nativeBlockConfig';

export type NativeViewMode = 'preview' | 'source';
export type NativePreviewLoadState = ComposerNativePreviewState | { status: 'loading'; requestedTarget: string };

/** Load the native strings once (default until the template resolves). */
export function useNativeStrings(): NativeBlockStrings {
	const [strings, setStrings] = React.useState<NativeBlockStrings>(DEFAULT_NATIVE_BLOCK_STRINGS);
	React.useEffect(() => {
		let alive = true;
		void loadNativeBlockStrings().then((loaded) => {
			if (alive) setStrings(loaded);
		});
		return () => {
			alive = false;
		};
	}, []);
	return strings;
}

/** The only header the native blocks carry: a preview/source segmented toggle. */
export function PreviewSourceToggle({
	mode,
	onChange,
	strings,
}: {
	mode: NativeViewMode;
	onChange: (mode: NativeViewMode) => void;
	strings: NativeBlockStrings;
}): React.ReactElement {
	return (
		<div className="pk-native-toggle" role="tablist" data-chrome="true">
			<ToggleButton active={mode === 'preview'} label={strings.preview} onClick={() => onChange('preview')} />
			<ToggleButton active={mode === 'source'} label={strings.source} onClick={() => onChange('source')} />
		</div>
	);
}

function ToggleButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}): React.ReactElement {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			role="tab"
			aria-selected={active}
			className="pk-native-toggle__btn"
			data-active={active || undefined}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}

export function useResolvedNativePreview(
	port: ComposerNativePreviewPort | undefined,
	request: ComposerNativePreviewRequest,
): { state: NativePreviewLoadState; reload: () => void } {
	const [reloadSeq, setReloadSeq] = React.useState(0);
	const [state, setState] = React.useState<NativePreviewLoadState>({
		status: 'loading',
		requestedTarget: request.target,
	});
	const reload = React.useCallback(() => setReloadSeq((n) => n + 1), []);

	React.useEffect(() => {
		let alive = true;
		setState({ status: 'loading', requestedTarget: request.target });
		if (!port) {
			setState({
				status: 'error',
				format: request.format,
				requestedTarget: request.target,
				message: request.target,
			});
			return;
		}
		void port.resolveNativePreview(request).then((next) => {
			if (alive) setState(next);
		});
		const off = port.onNativePreviewChange?.(request, () => {
			void port.resolveNativePreview(request).then((next) => {
				if (alive) setState(next);
			});
		});
		return () => {
			alive = false;
			off?.();
		};
	}, [port, request.sourcePath, request.target, request.format, reloadSeq]);

	return { state, reload };
}

/** Verbatim source view — the fallback of last resort, and the `源码` tab. */
export function NativeSourceView({
	raw,
	blockId,
	sourceFrom,
	nativeTarget,
}: {
	raw: string;
	blockId: string;
	sourceFrom?: number;
	nativeTarget?: string;
}): React.ReactElement {
	return (
		<pre
			className="pk-composer-mono pk-native-source"
			{...(sourceFrom !== undefined ? { 'data-src-text-from': sourceFrom } : {})}
			{...(nativeTarget ? { 'data-native-target': nativeTarget } : {})}
			data-block-id={blockId}
		>
			{raw}
		</pre>
	);
}

export function NativePreviewStatusView({
	state,
	strings,
	onReload,
}: {
	state: NativePreviewLoadState;
	strings: NativeBlockStrings;
	onReload?: () => void;
}): React.ReactElement {
	const title =
		state.status === 'loading'
			? strings.nativeLoading
			: state.status === 'missing'
				? strings.nativeMissing
				: strings.nativeError;
	const detail = state.status === 'loading' ? state.requestedTarget : state.message ?? state.requestedTarget;
	return (
		<div className="pk-native-empty" data-native-status={state.status}>
			<span className="pk-native-empty__title">{title}</span>
			<span className="pk-native-empty__detail">{detail}</span>
			{onReload && state.status !== 'loading' && (
				<Button variant="ghost" size="sm" className="pk-native-empty__reload" onClick={onReload}>
					{strings.nativeReload}
				</Button>
			)}
		</div>
	);
}

/** A labelled summary chip row (node counts, view counts, element counts). */
export function NativeStatRow({ items }: { items: Array<{ label: string; value: string | number }> }): React.ReactElement {
	return (
		<div className="pk-native-stats">
			{items.map((it) => (
				<span key={it.label} className="pk-native-stat">
					<span className="pk-native-stat__value">{it.value}</span>
					<span className="pk-native-stat__label">{it.label}</span>
				</span>
			))}
		</div>
	);
}

/** Frame wrapper: header toggle + the active view, anchored for source mapping. */
export function NativeBlockFrame({
	blockId,
	sourceFrom,
	mode,
	onMode,
	strings,
	showToggle = true,
	nativeTarget,
	children,
}: {
	blockId: string;
	sourceFrom: number;
	mode: NativeViewMode;
	onMode: (mode: NativeViewMode) => void;
	strings: NativeBlockStrings;
	showToggle?: boolean;
	nativeTarget?: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div
			className="pk-native-block"
			data-block-id={blockId}
			data-src-text-from={sourceFrom}
			data-mode={mode}
			{...(nativeTarget ? { 'data-native-target': nativeTarget } : {})}
		>
			{showToggle && <PreviewSourceToggle mode={mode} onChange={onMode} strings={strings} />}
			<div className="pk-native-block__body">{children}</div>
		</div>
	);
}
