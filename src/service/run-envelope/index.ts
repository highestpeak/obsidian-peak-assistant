// T3A RunEnvelope Core — local barrel.
//
// External consumers should import from `@/service/run-envelope`, never
// reach into `./types` or `./InMemoryRunRecorder` directly. Keeping this
// barrel small lets the boundary scanner and human readers see exactly
// what the envelope foundation exposes.

export type {
	ArtifactRef,
	ArtifactRefInput,
	FinalRunStatus,
	RunClock,
	RunEvent,
	RunIdFactory,
	RunSession,
	RunStatus,
	RunTrigger,
	StartRunInput,
} from './types';

export {
	InMemoryRunRecorder,
	type InMemoryRunRecorderOptions,
} from './InMemoryRunRecorder';
