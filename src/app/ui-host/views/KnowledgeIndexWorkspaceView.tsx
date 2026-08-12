import React from 'react';
import type { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { KNOWLEDGE_INDEX_WORKSPACE_VIEW_TYPE } from '@/app/ui-host/views/types';
import { KnowledgeIndexWorkspaceRuntime } from '@/app/search/KnowledgeIndexWorkspaceRuntime';
import { KnowledgeIndexWorkspace } from '@/ui/view/knowledge-index/KnowledgeIndexWorkspace';

export { KNOWLEDGE_INDEX_WORKSPACE_VIEW_TYPE };

export class KnowledgeIndexWorkspaceView extends ReactItemViewHost {
	protected readonly viewType = KNOWLEDGE_INDEX_WORKSPACE_VIEW_TYPE;
	protected readonly displayText = 'Knowledge Index';
	protected readonly icon: IconName = 'database-zap';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'pk-index-workspace-view'] as const;
	private readonly runtime = new KnowledgeIndexWorkspaceRuntime(this.appContext);

	protected renderElement(): React.ReactElement {
		return createReactElementWithServices(KnowledgeIndexWorkspace, { runtime: this.runtime }, this.appContext);
	}
}
