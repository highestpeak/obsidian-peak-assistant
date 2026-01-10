import React, { useState } from 'react';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { ViewMode } from '@/ui/view/chat-view/store/chatViewStore';
import { SettingsRoot } from '@/ui/view/SettingsView';
import DailyAnalysis from '@/ui/view/DailyAnalysis';
import { ProjectListViewComponent } from '@/ui/view/project-list-view/ProjectListView';
import { MessageHistoryViewComponent } from '@/ui/view/message-history-view/MessageHistoryView';
import { MessagesViewComponent } from '@/ui/view/chat-view/view-Messages';
import { HomeViewComponent } from '@/ui/view/chat-view/view-Home';
import { QuickSearchModalContent } from '@/ui/view/quick-search/SearchModal';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { MockPlugin } from './mocks/services/MockPlugin';
import { Settings, Search, BarChart3, MessageSquare, X } from 'lucide-react';

/**
 * Router component for desktop development
 * Matches the real Obsidian interface layout:
 * - Chat mode: Three-column layout (Project List | Chat View | Message History)
 * - Settings: Full-screen
 * - Daily Analysis: Full-screen
 */
export const DesktopRouter: React.FC = () => {
	const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'daily'>('chat');
	const [showSearchModal, setShowSearchModal] = useState(false);
	const { eventBus } = useServiceContext();
	const mockPlugin = new MockPlugin();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const chatViewStore = useChatViewStore();
	const viewMode = chatViewStore.viewMode || ViewMode.ALL_PROJECTS;

	// Mock data for DailyAnalysis
	const mockDailyData = {
		focusPoints: ['Focus point 1', 'Focus point 2', 'Focus point 3'],
		dispersalPoints: ['Distraction 1', 'Distraction 2'],
		emotionalScores: [
			{ category: 'Happiness', value: 7 },
			{ category: 'Energy', value: 6 },
			{ category: 'Focus', value: 8 },
		],
		growthInsights: ['Insight 1', 'Insight 2'],
		overallEvaluation: 'Overall evaluation text',
		totalStayDuration: 3600,
	};

	// Navigation bar component
	const NavigationBar = () => (
		<div style={{
			height: '48px',
			backgroundColor: '#f8f9fa',
			borderBottom: '1px solid #e5e5e5',
			display: 'flex',
			alignItems: 'center',
			padding: '0 16px',
			gap: '8px'
		}}>
			<button
				onClick={() => setCurrentView('chat')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'chat' ? '#e9ecef' : 'transparent',
					color: currentView === 'chat' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'chat' ? '500' : '400',
				}}
			>
				<MessageSquare size={16} />
				Chat
			</button>
			<button
				onClick={() => setShowSearchModal(true)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: showSearchModal ? '#e9ecef' : 'transparent',
					color: showSearchModal ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: showSearchModal ? '500' : '400',
				}}
			>
				<Search size={16} />
				Search
			</button>
			<button
				onClick={() => setCurrentView('settings')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'settings' ? '#e9ecef' : 'transparent',
					color: currentView === 'settings' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'settings' ? '500' : '400',
				}}
			>
				<Settings size={16} />
				Settings
			</button>
			<button
				onClick={() => setCurrentView('daily')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'daily' ? '#e9ecef' : 'transparent',
					color: currentView === 'daily' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'daily' ? '500' : '400',
				}}
			>
				<BarChart3 size={16} />
				Daily Analysis
			</button>
		</div>
	);

	// Render Settings or Daily Analysis as full-screen
	if (currentView === 'settings') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
					<SettingsRoot plugin={mockPlugin as any} eventBus={eventBus} />
				</div>
			</div>
		);
	}

	if (currentView === 'daily') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
					<DailyAnalysis data={mockDailyData as any} />
				</div>
			</div>
		);
	}

	// Chat mode: Three-column layout
	// Left: Project List (dark background)
	// Center: Chat View (light background)
	// Right: Message History (light background, only shown when in conversation mode)
	const isConversationMode =
		viewMode === ViewMode.CONVERSATION_IN_PROJECT ||
		viewMode === ViewMode.STANDALONE_CONVERSATION;

	const isHomeMode = viewMode === ViewMode.HOME;

	return (
		<div className="h-full w-full flex flex-col" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
			<NavigationBar />
			<div className="flex flex-row flex-1" style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden', minHeight: 0 }}>
				{/* Left Sidebar: Project List View */}
				<div className="w-64 flex-shrink-0 border-r overflow-hidden flex flex-col" style={{ width: '256px', flexShrink: 0, height: '100%', backgroundColor: '#1e1e1e', borderRightColor: '#333333', overflow: 'hidden' }}>
					<ProjectListViewComponent />
				</div>

				{/* Center: Chat View */}
				<div className="flex-1 flex flex-col overflow-hidden" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ffffff', overflow: 'hidden', minWidth: 0 }}>
					{isConversationMode ? (
						// Show MessagesView when in conversation mode
						<MessagesViewComponent />
					) : isHomeMode ? (
						// Show HomeView when in home mode
						<HomeViewComponent />
					) : (
						// Show ChatViewComponent for other modes (project list, all conversations, etc.)
						<ChatViewComponent viewMode={viewMode} />
					)}
				</div>

				{/* Right Sidebar: Message History View */}
				{isConversationMode && activeConversation && (
					<div className="w-80 flex-shrink-0 border-l overflow-hidden flex flex-col" style={{ width: '320px', flexShrink: 0, height: '100%', backgroundColor: '#ffffff', borderLeftColor: '#e5e5e5', overflow: 'hidden' }}>
						<MessageHistoryViewComponent />
					</div>
				)}
			</div>

			{/* Search Modal Overlay */}
			{showSearchModal && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 1000,
					}}
					onClick={() => setShowSearchModal(false)}
				>
					<div
						style={{
							backgroundColor: '#ffffff',
							borderRadius: '8px',
							width: '80%',
							maxHeight: '90%',
							overflow: 'auto',
							boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							padding: '16px',
							borderBottom: '1px solid #e5e5e5'
						}}>
							<h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Search</h2>
							<button
								onClick={() => setShowSearchModal(false)}
								style={{
									border: 'none',
									background: 'transparent',
									cursor: 'pointer',
									padding: '4px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<X size={20} />
							</button>
						</div>
						<div style={{ padding: '16px' }}>
							<QuickSearchModalContent onClose={() => setShowSearchModal(false)} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

