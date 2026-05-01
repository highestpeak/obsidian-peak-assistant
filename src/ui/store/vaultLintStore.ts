import { create } from 'zustand';
import type { LintScanResult, LintSignalId, LintTrendPoint } from '@/service/lint/types';

interface VaultLintState {
	currentScan: LintScanResult | null;
	isScanning: boolean;
	scanProgress: { detector: string; processed: number; total: number } | null;
	trendHistory: LintTrendPoint[];
	expandedSignal: LintSignalId | null;
	selectedFilePath: string | null;
	showInfoFindings: boolean;
}

interface VaultLintActions {
	setScanResult: (result: LintScanResult) => void;
	setScanning: (scanning: boolean) => void;
	setScanProgress: (progress: { detector: string; processed: number; total: number } | null) => void;
	setTrendHistory: (data: LintTrendPoint[]) => void;
	setExpandedSignal: (signalId: LintSignalId | null) => void;
	setSelectedFilePath: (path: string | null) => void;
	toggleShowInfoFindings: () => void;
	reset: () => void;
}

const initialState: VaultLintState = {
	currentScan: null,
	isScanning: false,
	scanProgress: null,
	trendHistory: [],
	expandedSignal: null,
	selectedFilePath: null,
	showInfoFindings: false,
};

export const useVaultLintStore = create<VaultLintState & VaultLintActions>((set) => ({
	...initialState,

	setScanResult: (result) => set({ currentScan: result, isScanning: false, scanProgress: null }),
	setScanning: (scanning) => set({ isScanning: scanning }),
	setScanProgress: (progress) => set({ scanProgress: progress }),
	setTrendHistory: (data) => set({ trendHistory: data }),
	setExpandedSignal: (signalId) => set((state) => ({
		expandedSignal: state.expandedSignal === signalId ? null : signalId,
		selectedFilePath: null,
	})),
	setSelectedFilePath: (path) => set({ selectedFilePath: path }),
	toggleShowInfoFindings: () => set((state) => ({ showInfoFindings: !state.showInfoFindings })),
	reset: () => set(initialState),
}));
