/**
 * Shared types for the 5-tab settings IA.
 *
 * Kept in its own file so tab modules (OverviewTab, AISetupTab, …) can import
 * `TabId` without pulling in the whole `SettingsView` component graph.
 */
export type TabId = 'overview' | 'aiSetup' | 'knowledgeIndex' | 'tools' | 'advanced';
