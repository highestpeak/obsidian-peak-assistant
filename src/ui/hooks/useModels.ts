import { useState, useEffect, useCallback } from 'react';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { useServiceContext } from '@/ui/context/ServiceContext';

/**
 * Hook for managing model data and loading state
 * Handles loading models, listening to settings updates, etc.
 */
export function useModels() {
	const { manager, eventBus } = useServiceContext();
	const [models, setModels] = useState<ModelInfoForSwitch[]>([]);
	const [isModelsLoading, setIsModelsLoading] = useState(false);

	// Load models function
	const loadModels = useCallback(async () => {
		if (!manager) return;
		setIsModelsLoading(true);
		try {
			const allModels = await manager.getAllAvailableModels();
			setModels(allModels);
		} catch (error) {
			console.error('[useModels] Error loading models:', error);
			setModels([]);
		} finally {
			setIsModelsLoading(false);
		}
	}, [manager]);

	// Initialize models loading
	useEffect(() => {
		loadModels();
	}, [loadModels]);

	// Listen for settings updates to reload models
	useEffect(() => {
		if (!eventBus) return;
		const unsubscribe = eventBus.on('settings-updated', () => {
			loadModels();
		});
		return unsubscribe;
	}, [eventBus, loadModels]);

	return {
		models,
		isModelsLoading,
		loadModels,
		setModels,
		setIsModelsLoading,
	};
}