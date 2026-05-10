import { create } from 'zustand';
import type { LintScanResult, LintSignalId, LintTrendPoint } from '@/service/lint/types';

interface VaultLintState {
	currentScan: LintScanResult | null;
	isScanning: boolean;
	scanProgress: { detector: string; processed: number; total: number } | null;
	trendHistory: LintTrendPoint[];
	expandedSignal: LintSignalId | null;
	showInfoFindings: boolean;

	setScanResult: (scan: LintScanResult, trend: LintTrendPoint[]) => void;
	setScanProgress: (p: VaultLintState['scanProgress']) => void;
	setExpandedSignal: (id: LintSignalId | null) => void;
	setShowInfoFindings: (show: boolean) => void;
}

export const useVaultLintStore = create<VaultLintState>((set) => ({
	currentScan: null,
	isScanning: false,
	scanProgress: null,
	trendHistory: [],
	expandedSignal: null,
	showInfoFindings: false,

	setScanResult: (scan, trend) => set({ currentScan: scan, trendHistory: trend, isScanning: false }),
	setScanProgress: (p) => set({ scanProgress: p, isScanning: p !== null }),
	setExpandedSignal: (id) => set({ expandedSignal: id }),
	setShowInfoFindings: (show) => set({ showInfoFindings: show }),
}));
