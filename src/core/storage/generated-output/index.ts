import { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import { DEFAULT_GENERATED_OUTPUTS } from './catalog';

export * from './types';
export { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
export { DEFAULT_GENERATED_OUTPUTS } from './catalog';

export function createDefaultGeneratedOutputRegistry(): GeneratedOutputRegistry {
	return new GeneratedOutputRegistry(DEFAULT_GENERATED_OUTPUTS);
}
