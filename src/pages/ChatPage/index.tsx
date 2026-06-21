import { useChat } from '@/hooks/useChat';
import { useTools } from '@/hooks/useTools';
import ConversationList from '@/components/layout/ConversationList';
import ChatPanel from '@/components/chat/ChatPanel';

export default function ChatPage() {
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

  // useTools loads tools into toolStore so ChatService can reference them.
  useTools();

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Conversation list */}
      <ConversationList
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={setActiveConversation}
        onNew={startNewChat}
        onDelete={deleteConversation}
        onRename={renameConversation}
      />

      {/* Center: Chat */}
      <ChatPanel
        conversation={activeConversation}
        isStreaming={isStreaming}
        onSend={sendMessage}
      />
    </div>
  );
}
