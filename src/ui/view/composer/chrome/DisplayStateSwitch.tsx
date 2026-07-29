import * as React from 'react';
import { Segmented } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * The three document display states (handoff §9.1 / §3.3 L164):
 *   - `clean` 纯净阅读 — accepted content + existing comments, read-only,
 *     no insight/candidate or new selection comments;
 *   - `work`  工作视图 — accepted content editable + insight/finding layer;
 *   - `all`   全部改动 — work + all pending candidates / diffs.
 * The chrome renders the layers by state; insight/candidate layers are empty in
 * the WP4 slice (wired by later integration) — the toggle already controls them.
 */
export type ComposerDisplayState = 'work' | 'all' | 'clean';

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
				{ value: 'work', label: s.work },
				{ value: 'all', label: s.all },
				{ value: 'clean', label: s.clean },
			]}
		/>
	);
}
