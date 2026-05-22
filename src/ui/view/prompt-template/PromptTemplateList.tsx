import React, { useState, useMemo, useCallback } from 'react';
import { Notice } from 'obsidian';
import { FolderOpen, Search } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';
import { PromptGroupSection } from './components/PromptGroupSection';
import type { PromptItemData } from './components/PromptItem';
import {
    PROMPT_GROUPS,
    getPromptsByGroup,
    TEMPLATE_METADATA,
    type TemplateId,
    type PromptGroup,
} from '@/core/template/TemplateRegistry';

interface Props {
    onClose: () => void;
}

export const PromptTemplateList: React.FC<Props> = ({ onClose }) => {
    const { app } = useServiceContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [overrides, setOverrides] = useState<Set<string>>(() => {
        return AppContext.getManager().prompt.scanOverrides();
    });

    // Build grouped items with paired system prompts
    const groupedItems = useMemo(() => {
        const byGroup = getPromptsByGroup();
        const result = new Map<PromptGroup, PromptItemData[]>();

        for (const [group, entries] of byGroup) {
            const items: PromptItemData[] = [];
            const processedSystemIds = new Set<string>();

            for (const entry of entries) {
                if (processedSystemIds.has(String(entry.id))) continue;

                const item: PromptItemData = { id: entry.id, meta: entry.meta };

                if (entry.meta.systemPromptId) {
                    const systemId = entry.meta.systemPromptId as unknown as TemplateId;
                    const systemMeta = TEMPLATE_METADATA[systemId];
                    if (systemMeta) {
                        item.systemEntry = { id: systemId, meta: systemMeta };
                        processedSystemIds.add(String(systemId));
                    }
                }

                items.push(item);
            }

            result.set(group, items.filter(item => !processedSystemIds.has(String(item.id))));
        }

        return result;
    }, []);

    const handleOpen = useCallback(async (id: TemplateId) => {
        try {
            const ps = AppContext.getManager().prompt;
            const filePath = await ps.createOverrideFile(id);
            await app.workspace.openLinkText(filePath, '', false);
            setOverrides(ps.scanOverrides());
        } catch (err) {
            new Notice(`Failed to create override file: ${err}`);
        }
    }, [app]);

    const handleReset = useCallback(async (id: TemplateId) => {
        const meta = TEMPLATE_METADATA[id];
        const idsToReset: TemplateId[] = [id];
        if (meta?.systemPromptId) {
            idsToReset.push(meta.systemPromptId as unknown as TemplateId);
        }

        const confirmMsg = idsToReset.length > 1
            ? 'Reset to default? This will delete both system and user override files.'
            : 'Reset to default? This will delete your custom prompt file.';

        if (!confirm(confirmMsg)) return;

        try {
            const ps = AppContext.getManager().prompt;
            for (const resetId of idsToReset) {
                if (overrides.has(String(resetId))) {
                    await ps.deleteOverride(resetId);
                }
            }
            setOverrides(ps.scanOverrides());
            new Notice('Prompt reset to default.');
        } catch (err) {
            new Notice(`Failed to reset: ${err}`);
        }
    }, [overrides]);

    const handleOpenFolder = useCallback(() => {
        const ps = AppContext.getManager().prompt;
        const folderPath = ps.getPromptFolder();
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (folder) {
            (app as any).internalPlugins?.plugins?.['file-explorer']?.instance?.revealInFolder?.(folder);
        } else {
            new Notice(`Prompts folder not found: ${folderPath}`);
        }
    }, [app]);

    const totalPrompts = Array.from(groupedItems.values()).reduce(
        (sum, items) => sum + items.reduce((n, item) => n + (item.systemEntry ? 2 : 1), 0), 0
    );
    const totalOverridden = overrides.size;

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full" style={{ maxHeight: '70vh' }}>
            {/* Header */}
            <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-4 pktw-border-b pktw-border-[var(--pk-border)]">
                <span className="pktw-text-[15px] pktw-font-semibold pktw-text-[var(--pk-text-primary)]">
                    Prompt Templates
                </span>
                <div className="pktw-relative">
                    <Search className="pktw-absolute pktw-left-2.5 pktw-top-1/2 pktw-transform pktw-translate-y-[-50%] pktw-w-3.5 pktw-h-3.5 pktw-text-[var(--pk-text-tertiary)]" />
                    <input
                        className="pktw-w-[220px] pktw-py-1.5 pktw-pl-8 pktw-pr-3 pktw-rounded-md pktw-border pktw-border-[var(--pk-border)] pktw-bg-[var(--pk-bg)] pktw-text-[var(--pk-text-primary)] pktw-text-[12px] pktw-outline-none focus:pktw-border-[var(--pk-accent)]"
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            {/* Body */}
            <div className="pktw-flex-1 pktw-overflow-y-auto pktw-py-2">
                {PROMPT_GROUPS.map(group => {
                    const items = groupedItems.get(group.key) || [];
                    if (items.length === 0) return null;
                    return (
                        <PromptGroupSection
                            key={group.key}
                            label={group.label}
                            items={items}
                            defaultExpanded={group.defaultExpanded}
                            overrides={overrides}
                            onOpen={handleOpen}
                            onReset={handleReset}
                            searchQuery={searchQuery || undefined}
                        />
                    );
                })}
            </div>

            {/* Footer */}
            <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-t pktw-border-[var(--pk-border)]">
                <span className="pktw-text-[11px] pktw-text-[var(--pk-text-tertiary)]">
                    <span className="pktw-text-[var(--pk-accent)] pktw-font-medium">{totalOverridden}</span>
                    {' '}of {totalPrompts} overridden
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    className="pktw-shadow-none pktw-h-7 pktw-text-[11px] pktw-text-[var(--pk-text-secondary)] pktw-bg-transparent pktw-border-[var(--pk-border)] pktw-px-3 pktw-py-1 pktw-cursor-pointer hover:pktw-bg-pk-highlight hover:pktw-border-pk-border-accent hover:pktw-text-pk-accent pktw-transition-all pktw-flex pktw-items-center pktw-gap-1.5"
                    onClick={handleOpenFolder}
                >
                    <FolderOpen className="pktw-w-3 pktw-h-3" />
                    Open Prompts Folder
                </Button>
            </div>
        </div>
    );
};
