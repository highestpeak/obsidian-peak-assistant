import type { GeneratedOutputDescriptor } from '../types';
import { ANALYSIS_GENERATED_OUTPUTS } from './analysisOutputs';
import { CHAT_GENERATED_OUTPUTS } from './chatOutputs';
import { COMPOSER_MEDIA_GENERATED_OUTPUTS } from './composerMediaOutputs';
import { GRAPH_GENERATED_OUTPUTS } from './graphOutputs';
import { LOCAL_LEGACY_GENERATED_OUTPUTS } from './localLegacyOutputs';
import { PROFILE_GENERATED_OUTPUTS } from './profileOutputs';

export const DEFAULT_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = Object.freeze([
	...PROFILE_GENERATED_OUTPUTS,
	...CHAT_GENERATED_OUTPUTS,
	...ANALYSIS_GENERATED_OUTPUTS,
	...GRAPH_GENERATED_OUTPUTS,
	...COMPOSER_MEDIA_GENERATED_OUTPUTS,
	...LOCAL_LEGACY_GENERATED_OUTPUTS,
]);
