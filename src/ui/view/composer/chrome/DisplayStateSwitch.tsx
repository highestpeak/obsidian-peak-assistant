import * as React from 'react';
import { Segmented } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * The two document display states:
 *   - `clean` 纯净阅读 — accepted content + existing comments, read-only,
 *     no insight/candidate or new selection comments;
 *   - `edit` 编辑视图 — accepted content editable + findings + origin candidates.
 * “审阅全部改动” is a contextual action inside edit mode, never a third state.
 */
export type ComposerDisplayState = 'edit' | 'clean';

export function DisplayStateSwitch({
	value,
	onChange,
}: {
	value: ComposerDisplayState;
	onChange: (next: ComposerDisplayState) => void;
}): React.ReactElement {
	const { config } = useComposerChrome();
	const s = config.chrome.displayStates;
	return (
		<Segmented<ComposerDisplayState>
			className="pk-composer-display-switch"
			aria-label={s.groupLabel}
			variant="animated-pill"
			size="sm"
			thumbLayoutId="composer-display-state-thumb"
			value={value}
			onValueChange={onChange}
			options={[
				{ value: 'edit', label: s.edit },
				{ value: 'clean', label: s.clean },
			]}
		/>
	);
}
