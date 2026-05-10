// src/ui/view/chat-view/components/messages/SystemPromptPopover.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/component/shared-ui/popover';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Button } from '@/ui/component/shared-ui/button';
import { SlidersHorizontal, Check } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Notice } from 'obsidian';

/**
 * Popover for editing per-conversation custom system prompt.
 */
export const SystemPromptPopover: React.FC = () => {
  const { manager } = useServiceContext();
  const conversation = useChatDataStore((state) => state.activeConversation);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft with conversation meta when popover opens or conversation changes
  useEffect(() => {
    if (isOpen && conversation) {
      setDraft(conversation.meta.customSystemPrompt ?? '');
    }
  }, [isOpen, conversation?.meta.id]);

  if (!conversation) return null;

  const hasCustomPrompt = !!conversation.meta.customSystemPrompt;

  const handleSave = async () => {
    if (!conversation) return;
    setIsSaving(true);
    try {
      await manager.conv.updateConversationCustomSystemPrompt({
        conversationId: conversation.meta.id,
        customSystemPrompt: draft.trim() || undefined,
      });
      // Update the local store
      const updated = await manager.readConversation(conversation.meta.id, true);
      if (updated) {
        useChatDataStore.getState().setActiveConversation(updated);
      }
      new Notice(draft.trim() ? 'System prompt saved.' : 'System prompt cleared.');
      setIsOpen(false);
    } catch (e) {
      new Notice(`Failed to save: ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setDraft('');
    if (!conversation) return;
    setIsSaving(true);
    try {
      await manager.conv.updateConversationCustomSystemPrompt({
        conversationId: conversation.meta.id,
        customSystemPrompt: undefined,
      });
      const updated = await manager.readConversation(conversation.meta.id, true);
      if (updated) {
        useChatDataStore.getState().setActiveConversation(updated);
      }
      new Notice('System prompt cleared.');
      setIsOpen(false);
    } catch (e) {
      new Notice(`Failed to clear: ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <IconButton
          size="lg"
          title="Custom system prompt"
          className="hover:pktw-bg-gray-200"
        >
          <SlidersHorizontal className={`pktw-w-4 pktw-h-4 ${
            hasCustomPrompt
              ? 'pktw-text-accent'
              : 'pktw-text-muted-foreground group-hover:pktw-text-black'
          }`} />
          {hasCustomPrompt && (
            <span className="pktw-absolute pktw-top-0.5 pktw-right-0.5 pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-accent" />
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        className="pktw-w-[400px] pktw-max-w-[90vw] pktw-p-0 pktw-bg-popover pktw-shadow-lg"
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
      >
        <div className="pktw-flex pktw-flex-col">
          {/* Header */}
          <div className="pktw-px-4 pktw-py-3 pktw-border-b pktw-border-border">
            <span className="pktw-text-sm pktw-font-semibold">System Prompt</span>
            <span className="pktw-block pktw-text-[11px] pktw-text-muted-foreground pktw-mt-0.5">
              Prepended to the default system prompt for this conversation only.
            </span>
          </div>

          {/* Textarea */}
          <div className="pktw-px-4 pktw-py-3">
            <textarea
              ref={textareaRef}
              className="pktw-w-full pktw-min-h-[120px] pktw-max-h-[300px] pktw-p-3 pktw-text-sm pktw-rounded-lg pktw-border pktw-border-border pktw-bg-background pktw-resize-y pktw-outline-none focus:pktw-border-accent pktw-transition-colors pktw-font-mono"
              placeholder="e.g., Always respond in bullet points. Focus on practical examples."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />
            {draft.trim() && (
              <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-mt-1 pktw-block">
                {draft.trim().length} characters
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-3 pktw-border-t pktw-border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!hasCustomPrompt && !draft.trim()}
              className="pktw-text-xs"
            >
              Clear
            </Button>
            <div className="pktw-flex pktw-items-center pktw-gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="pktw-text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="pktw-text-xs"
              >
                <Check className="pktw-w-3 pktw-h-3 pktw-mr-1" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
