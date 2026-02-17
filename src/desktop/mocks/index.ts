// Service mocks (our own services)
export { MockApp } from './services/MockApp';
export { MockEventBus } from './services/MockEventBus';
export { MockAIServiceManager } from './services/MockAIServiceManager';
export { MockViewManager } from './services/MockViewManager';
export { MockSearchClient } from './services/MockSearchClient';
export { MockPlugin } from './services/MockPlugin';

// Inspector mock data (for Find path / Links in desktop env)
export {
	MOCK_INSPECTOR_CANDIDATE_PATHS,
	MOCK_INSPECTOR_PATH_RESULT,
	type MockInspectorLinkItem,
} from './inspectorMockData';

