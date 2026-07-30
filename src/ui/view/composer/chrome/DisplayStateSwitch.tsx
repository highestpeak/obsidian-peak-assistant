import * as React from 'react';
import { Segmented } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * The two Composer display states plus the exit to Native Markdown:
 *   - `clean` 纯净阅读 — accepted content + existing comments, read-only,
 *     no insight/candidate or new selection comments;
 *   - `edit` 编辑视图 — accepted content editable + findings + origin candidates.
 *   - `markdown` is an action that converts the current leaf and unmounts
 *     Composer; it is never persisted as a Composer display state.
 * “审阅全部改动” is a contextual action inside edit mode, never a third state.
 */
export type ComposerDisplayState = 'edit' | 'clean';
type ComposerViewChoice = ComposerDisplayState | 'markdown';

export function DisplayStateSwitch({
	value,
	onChange,
	onOpenNativeMarkdown,
}: {
	value: ComposerDisplayState;
	onChange: (next: ComposerDisplayState) => void;
	onOpenNativeMarkdown?: () => void;
}): React.ReactElement {
	const { config } = useComposerChrome();
	const s = config.chrome.displayStates;
	function selectView(next: ComposerViewChoice): void {
		if (next === 'markdown') {
			onOpenNativeMarkdown?.();
			return;
		}
		onChange(next);
	}
	return (
		<Segmented<ComposerViewChoice>
			className="pk-composer-display-switch"
			aria-label={s.groupLabel}
			variant="animated-pill"
			size="sm"
			thumbLayoutId="composer-display-state-thumb"
			value={value}
			onValueChange={selectView}
			options={[
				{ value: 'edit', label: s.edit },
				{ value: 'clean', label: s.clean },
				...(onOpenNativeMarkdown
					? [{ value: 'markdown' as const, label: s.nativeMarkdown }]
					: []),
			]}
		/>
	);
}
