/**
 * Peak Composer — shared native block chrome (WP8). The `预览 / 源码` toggle,
 * the verbatim source view (newlines/indentation/tabs preserved), and the
 * strings hook every native preview component uses. Read-only: no editing chrome
 * here — the flattened action row (copy / AI edit) is owned by ComposerRoot.
 */

import * as React from 'react';
import {
	DEFAULT_NATIVE_BLOCK_STRINGS,
	loadNativeBlockStrings,
	type NativeBlockStrings,
} from './nativeBlockConfig';

export type NativeViewMode = 'preview' | 'source';

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
		<button
			type="button"
			role="tab"
			aria-selected={active}
			className="pk-native-toggle__btn"
			data-active={active || undefined}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

/** Verbatim source view — the fallback of last resort, and the `源码` tab. */
export function NativeSourceView({ raw, blockId, sourceFrom }: { raw: string; blockId: string; sourceFrom: number }): React.ReactElement {
	return (
		<pre className="pk-composer-mono pk-native-source" data-src-text-from={sourceFrom} data-block-id={blockId}>
			{raw}
		</pre>
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
	children,
}: {
	blockId: string;
	sourceFrom: number;
	mode: NativeViewMode;
	onMode: (mode: NativeViewMode) => void;
	strings: NativeBlockStrings;
	showToggle?: boolean;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="pk-native-block" data-block-id={blockId} data-src-text-from={sourceFrom} data-mode={mode}>
			{showToggle && <PreviewSourceToggle mode={mode} onChange={onMode} strings={strings} />}
			<div className="pk-native-block__body">{children}</div>
		</div>
	);
}
