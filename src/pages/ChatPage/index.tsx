import { useChat } from '@/hooks/useChat';
import { useTools } from '@/hooks/useTools';
import ConversationList from '@/components/layout/ConversationList';
import ChatPanel from '@/components/chat/ChatPanel';

export default function ChatPage() {
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const {
    conversations,
    activeConversation,
    activeConversationId,
    isStreaming,
    sendMessage,
    startNewChat,
    deleteConversation,
    renameConversation,
    setActiveConversation,
  } = useChat();

  const { tools } = useTools();

  return (
    <div className="flex flex-1 overflow-hidden bg-white">
      <div className="hidden md:flex">
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={setActiveConversation}
          onNew={startNewChat}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      </div>

      {conversationsOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 left-12 z-30 bg-slate-950/20 md:hidden"
            onClick={() => setConversationsOpen(false)}
            aria-label="Close conversations"
          />
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={(id) => {
              setActiveConversation(id);
              setConversationsOpen(false);
            }}
            onNew={() => {
              startNewChat();
              setConversationsOpen(false);
            }}
            onDelete={deleteConversation}
            onRename={renameConversation}
            onClose={() => setConversationsOpen(false)}
            className="fixed inset-y-0 left-12 z-40 w-[min(18rem,calc(100vw-3rem))] shadow-xl md:hidden"
          />
        </>
      ) : null}

      {/* Center: Chat */}
      <ChatPanel
        conversation={activeConversation}
        isStreaming={isStreaming}
        onSend={sendMessage}
        tools={tools}
        onOpenConversations={() => setConversationsOpen(true)}
      />
    </div>
  );
}
import { useState } from 'react';
