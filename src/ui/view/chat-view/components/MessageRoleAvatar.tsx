import React from 'react';
import { User } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProviderIcon } from '@/ui/view/settings/components/ProviderIcon';
import type { ProfileKind } from '@/core/profiles/types';

interface MessageRoleAvatarProps {
    role: 'user' | 'assistant';
    provider?: string;
    model?: string;
}

export const MessageRoleAvatar: React.FC<MessageRoleAvatarProps> = ({ role, provider, model }) => {
    const isUser = role === 'user';
    return (
        <div
            className={cn(
                "pktw-w-5 pktw-h-5 pktw-rounded-[5px] pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5",
                isUser ? "pktw-bg-muted pktw-text-muted-foreground" : "pktw-bg-accent/10 pktw-text-accent"
            )}
            title={!isUser && provider ? `${provider}/${model ?? ''}` : undefined}
        >
            {isUser ? (
                <User className="pktw-w-3 pktw-h-3" />
            ) : (
                <ProviderIcon kind={(provider ?? 'custom') as ProfileKind} size={14} />
            )}
        </div>
    );
};
