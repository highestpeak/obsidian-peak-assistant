/**
 * Settings panel block: owns show/hide and panel position.
 * Exposes minimal API for toolbar and settings panel.
 */

import { useEffect, useState, useRef } from 'react';

export type UseGraphSettingsResult = {
	showControls: boolean;
	setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
	settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
	settingsPanelPosition: { top: number; right: number } | null;
};

export function useGraphSettings(): UseGraphSettingsResult {
	const [showControls, setShowControls] = useState(false);
	const [settingsPanelPosition, setSettingsPanelPosition] = useState<{
		top: number;
		right: number;
	} | null>(null);
	const settingsButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!showControls) {
			setSettingsPanelPosition(null);
			return;
		}
		const btn = settingsButtonRef.current;
		const update = () => {
			if (!btn) return;
			const rect = btn.getBoundingClientRect();
			setSettingsPanelPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
		};
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	}, [showControls]);

	return {
		showControls,
		setShowControls,
		settingsButtonRef,
		settingsPanelPosition,
	};
}
