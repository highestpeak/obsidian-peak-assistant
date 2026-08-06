import React, { useState } from 'react';
import type { CommandCenterRuntimePort } from '@/core/command-center';
import { CommandCenterCustomize } from './CommandCenterCustomize';
import { CommandCenterLauncher } from './CommandCenterLauncher';
import type {
	CommandCenterCustomizeIntent,
	CommandCenterLauncherRestoreState,
} from './commandCenterCustomizeIntent';

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
	const [customizeIntent, setCustomizeIntent] = useState<CommandCenterCustomizeIntent | null>(null);
	const [launcherRestoreState, setLauncherRestoreState] = useState<CommandCenterLauncherRestoreState | null>(null);
	if (mode === 'customize') {
		return (
			<CommandCenterCustomize
				runtime={runtime}
				intent={customizeIntent}
				onBack={() => setMode('launcher')}
				onClose={onClose}
			/>
		);
	}
	return (
		<CommandCenterLauncher
			runtime={runtime}
			restoreState={launcherRestoreState}
			onCustomize={(intent, restoreState) => {
				setCustomizeIntent(intent ?? null);
				setLauncherRestoreState(restoreState ?? null);
				setMode('customize');
			}}
			onClose={onClose}
		/>
	);
}
