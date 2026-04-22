import React, { useState } from 'react';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { ViewMode } from '@/ui/view/chat-view/store/chatViewStore';
import { SettingsRoot } from '@/ui/view/SettingsView';
import { ProjectListViewComponent } from '@/ui/view/project-list-view/ProjectListView';
import { MessageHistoryViewComponent } from '@/ui/view/message-history-view/MessageHistoryView';
import { MessagesViewComponent } from '@/ui/view/chat-view/view-Messages';
import { HomeViewComponent } from '@/ui/view/chat-view/view-Home';
import { QuickSearchModalContent } from '@/ui/view/quick-search/SearchModal';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { MockPlugin } from './mocks/services/MockPlugin';
import { ConfirmDialog } from '@/ui/view/modals/ConfirmDialog';
import { Settings, Search, MessageSquare, X, Trash2, Network, Link2, GitBranch } from 'lucide-react';
import { GraphDebugView } from './views/GraphDebugView';
import { LinksTabMockView } from './views/LinksTabMockView';
import { MindFlowTestView } from './views/MindFlowTestView';

/**
 * Router component for desktop development
 * Matches the real Obsidian interface layout:
 * - Chat mode: Three-column layout (Project List | Chat View | Message History)
 * - Settings: Full-screen
 */
export const DesktopRouter: React.FC<{
	useMockAI: boolean;
	onToggleMockAI: () => void;
}> = ({ useMockAI, onToggleMockAI }) => {
	const [currentView, setCurrentView] = useState<'chat' | 'settings' | 'graph-debug' | 'links-mock' | 'mindflow-test'>('chat');
	const [showSearchModal, setShowSearchModal] = useState(false);
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);
	const { eventBus } = useServiceContext();
	const mockPlugin = new MockPlugin();
	const activeConversation = useChatDataStore((state) => state.activeConversation);
	const chatViewStore = useChatViewStore();
	const viewMode = chatViewStore.viewMode || ViewMode.ALL_PROJECTS;

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
				onClick={() => setCurrentView('graph-debug')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'graph-debug' ? '#e9ecef' : 'transparent',
					color: currentView === 'graph-debug' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'graph-debug' ? '500' : '400',
				}}
				title="Paste graph Copy JSON to debug visualization"
			>
				<Network size={16} />
				Graph Debug
			</button>
			<button
				onClick={() => setCurrentView('links-mock')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'links-mock' ? '#e9ecef' : 'transparent',
					color: currentView === 'links-mock' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'links-mock' ? '500' : '400',
				}}
				title="Paste links JSON to test Links tab"
			>
				<Link2 size={16} />
				Links Mock
			</button>
			<button
				onClick={() => setCurrentView('mindflow-test')}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: currentView === 'mindflow-test' ? '#e9ecef' : 'transparent',
					color: currentView === 'mindflow-test' ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: currentView === 'mindflow-test' ? '500' : '400',
				}}
				title="Paste Mermaid to test slot diagram display"
			>
				<GitBranch size={16} />
				Slot Mermaid Test
			</button>
			<button
				onClick={() => setShowConfirmDialog(true)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					padding: '6px 12px',
					borderRadius: '6px',
					border: 'none',
					backgroundColor: showConfirmDialog ? '#e9ecef' : 'transparent',
					color: showConfirmDialog ? '#000' : '#666',
					cursor: 'pointer',
					fontSize: '14px',
					fontWeight: showConfirmDialog ? '500' : '400',
				}}
			>
				<Trash2 size={16} />
				Test Confirm
			</button>

			{/* AI Mode Toggle Switch */}
			<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
				<span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>
					AI Mode:
				</span>
				<div
					onClick={onToggleMockAI}
					style={{
						position: 'relative',
						width: '50px',
						height: '24px',
						backgroundColor: useMockAI ? '#28a745' : '#007bff',
						borderRadius: '12px',
						cursor: 'pointer',
						transition: 'background-color 0.2s ease',
						border: 'none',
						display: 'flex',
						alignItems: 'center',
						padding: '0 2px',
					}}
					title={useMockAI ? 'Currently in Mock mode (no tokens used). Click to switch to Real AI.' : 'Currently in Real AI mode (uses tokens). Click to switch to Mock mode.'}
				>
					<div
						style={{
							width: '20px',
							height: '20px',
							backgroundColor: 'white',
							borderRadius: '50%',
							transition: 'transform 0.2s ease',
							transform: useMockAI ? 'translateX(26px)' : 'translateX(0)',
							boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
						}}
					/>
				</div>
				<span style={{
					fontSize: '11px',
					color: useMockAI ? '#28a745' : '#007bff',
					fontWeight: '600',
					minWidth: '35px',
					textAlign: 'left'
				}}>
					{useMockAI ? 'MOCK' : 'REAL'}
				</span>
			</div>
		</div>
	);

	// Render Settings as full-screen
	if (currentView === 'settings') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
					<SettingsRoot />
				</div>
			</div>
		);
	}

	if (currentView === 'graph-debug') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
					<GraphDebugView />
				</div>
			</div>
		);
	}

	if (currentView === 'links-mock') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
					<LinksTabMockView />
				</div>
			</div>
		);
	}

	if (currentView === 'mindflow-test') {
		return (
			<div className="h-full w-full flex flex-col" style={{ backgroundColor: '#ffffff', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
				<NavigationBar />
				<div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
					<MindFlowTestView />
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
						<ChatViewComponent />
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
						<div style={{ flex: 1, minHeight: 0, padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
							<QuickSearchModalContent onClose={() => setShowSearchModal(false)} />
						</div>
					</div>
				</div>
			)}

			{/* Confirm Dialog */}
			{showConfirmDialog && (
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
					onClick={() => setShowConfirmDialog(false)}
				>
					<div onClick={(e) => e.stopPropagation()}>
						<ConfirmDialog
							open={showConfirmDialog}
							onOpenChange={setShowConfirmDialog}
							title="Delete Item"
							message="Are you sure you want to delete this item? This action cannot be undone."
							onConfirm={() => {
								console.log('Item deleted!');
							}}
							confirmText="Delete"
							cancelText="Cancel"
							requireConfirmationText="I love u CPU"
						/>
					</div>
				</div>
			)}
		</div>
	);
};

