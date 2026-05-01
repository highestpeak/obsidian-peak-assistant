import React from 'react';
import { User, Sparkles } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface MessageRoleAvatarProps {
  role: 'user' | 'assistant';
}

export const MessageRoleAvatar: React.FC<MessageRoleAvatarProps> = ({ role }) => {
  const isUser = role === 'user';
  return (
    <div className={cn(
      "pktw-w-5 pktw-h-5 pktw-rounded-[5px] pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5",
      isUser ? "pktw-bg-muted pktw-text-muted-foreground" : "pktw-bg-accent/10 pktw-text-accent"
    )}>
      {isUser ? <User className="pktw-w-3 pktw-h-3" /> : <Sparkles className="pktw-w-3 pktw-h-3" />}
    </div>
  );
};
