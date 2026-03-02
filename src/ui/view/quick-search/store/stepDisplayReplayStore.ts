import { create } from 'zustand';

interface StepDisplayReplayState {
	/** True when stream has started; StepDisplay may read last event from UI event store on mount. */
	streamStarted: boolean;
	reset: () => void;
	setStreamStarted: (v: boolean) => void;
}

export const useStepDisplayReplayStore = create<StepDisplayReplayState>((set) => ({
	streamStarted: false,
	reset: () => set({ streamStarted: false }),
	setStreamStarted: (v) => set({ streamStarted: v }),
}));
