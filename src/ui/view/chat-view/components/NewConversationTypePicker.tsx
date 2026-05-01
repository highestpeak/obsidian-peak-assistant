import React from 'react';
import type { ConversationType } from '@/service/chat/conversation-types';
import { cn } from '@/ui/react/lib/utils';
import { ConversationTypeIcon } from '@/ui/component/mine/ConversationTypeIcon';

interface TypeOption {
  type: ConversationType;
  label: string;
  description: string;
  disabled?: boolean;
}

const TYPE_OPTIONS: TypeOption[] = [
  { type: { kind: 'chat' }, label: 'Chat', description: 'Free-form conversation' },
  { type: { kind: 'agent' }, label: 'Agent', description: 'Research with vault tools' },
  { type: { kind: 'plan' }, label: 'Plan', description: 'Structured planning' },
  { type: { kind: 'canvas' }, label: 'Canvas', description: 'Visual thinking', disabled: true },
];

interface Props {
  selectedKind: string;
  onSelectType: (type: ConversationType) => void;
}

export const NewConversationTypePicker: React.FC<Props> = ({ selectedKind, onSelectType }) => (
  <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-8">
    <span className="pktw-text-sm pktw-text-muted-foreground">Start a new conversation</span>
    <div className="pktw-grid pktw-grid-cols-2 pktw-gap-3 pktw-w-full pktw-max-w-[360px]">
      {TYPE_OPTIONS.map(opt => {
        const isSelected = opt.type.kind === selectedKind;
        return (
          <div
            key={opt.type.kind}
            className={cn(
              "pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-4 pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all pktw-relative",
              opt.disabled
                ? "pktw-opacity-50 pktw-cursor-not-allowed pktw-border-border"
                : isSelected
                  ? "pktw-border-[var(--pk-accent,#6d28d9)] pktw-bg-accent/5"
                  : "pktw-border-border hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5"
            )}
            onClick={() => !opt.disabled && onSelectType(opt.type)}
          >
            <ConversationTypeIcon type={opt.type} className="pktw-w-5 pktw-h-5" />
            <span className="pktw-text-sm pktw-font-medium">{opt.label}</span>
            <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-text-center">{opt.description}</span>
            {opt.disabled && (
              <span className="pktw-absolute pktw-top-1.5 pktw-right-1.5 pktw-text-[8px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground">
                Soon
              </span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
