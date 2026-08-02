import React, { useState } from 'react';
import type { CommandCenterRuntimePort } from '@/core/command-center';
import { CommandCenterCustomize } from './CommandCenterCustomize';
import { CommandCenterLauncher } from './CommandCenterLauncher';

export function CommandCenterSurface({
	runtime,
	initialMode = 'launcher',
	onClose,
}: {
	runtime: CommandCenterRuntimePort;
	initialMode?: 'launcher' | 'customize';
	onClose: () => void;
}): React.ReactElement {
	const [mode, setMode] = useState<'launcher' | 'customize'>(initialMode);
	if (mode === 'customize') {
		return (
			<CommandCenterCustomize
				runtime={runtime}
				onBack={() => setMode('launcher')}
				onDone={() => setMode('launcher')}
			/>
		);
	}
	return <CommandCenterLauncher runtime={runtime} onCustomize={() => setMode('customize')} onClose={onClose} />;
}
