/**
 * Registry where surfaces self-register adapters.
 *
 * Pattern (each surface, in its own PR):
 *   import { CapabilityRegistry } from '@/service/capabilities';
 *   CapabilityRegistry.getInstance().register({
 *     surfaceId: 'chat',
 *     surfaceLabel: 'Chat',
 *     getCapabilityStatus: async () => [...],
 *   });
 *
 * Settings consumes via getAll() or getById(id).
 */

import type { SurfaceCapabilityAdapter, SurfaceId } from './SurfaceCapability';

export class CapabilityRegistry {
	private static instance: CapabilityRegistry | null = null;
	private adapters = new Map<SurfaceId, SurfaceCapabilityAdapter>();

	private constructor() {}

	static getInstance(): CapabilityRegistry {
		if (!this.instance) this.instance = new CapabilityRegistry();
		return this.instance;
	}

	/** Test seam — reset registry between tests. NOT for production use. */
	static resetForTest(): void {
		this.instance = null;
	}

	/** Surface registers (or re-registers, last-write-wins) its adapter. */
	register(adapter: SurfaceCapabilityAdapter): void {
		this.adapters.set(adapter.surfaceId, adapter);
	}

	/** Settings calls this on render. Returns adapters in stable surface-id order. */
	getAll(): SurfaceCapabilityAdapter[] {
		const order: SurfaceId[] = ['chat', 'vault-search', 'ai-analysis', 'copilot', 'web-chat'];
		const registered = this.adapters;
		return order
			.filter((id) => registered.has(id))
			.map((id) => registered.get(id)!);
	}

	/** Settings calls this when expanding one surface's row. */
	getById(id: SurfaceId): SurfaceCapabilityAdapter | undefined {
		return this.adapters.get(id);
	}

	/** Total count for quick header summary in Settings. */
	size(): number {
		return this.adapters.size;
	}
}
