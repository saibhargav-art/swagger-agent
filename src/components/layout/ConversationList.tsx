import { useState } from 'react';
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/index';
import { formatDate, truncate } from '@/utils/format';
import type { Conversation } from '@/types/chat';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const commitEdit = (id: string) => {
    if (editValue.trim()) onRename(id, editValue.trim());
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  // Group by date
  const grouped = conversations.reduce<Record<string, Conversation[]>>(
    (acc, conv) => {
      const label = formatDate(conv.updatedAt);
      (acc[label] ??= []).push(conv);
      return acc;
    },
    {}
  );

  return (
    <div className="flex w-56 flex-col border-r border-slate-200 bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">Chats</span>
        <Button variant="ghost" size="icon" onClick={onNew} title="New chat">
          <Plus size={16} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <p className="p-4 text-xs text-slate-400 text-center">
            No conversations yet.
            <br />
            Start a new chat.
          </p>
        ) : (
          Object.entries(grouped).map(([date, convs]) => (
            <div key={date}>
              <p className="px-3 pt-3 pb-1 text-xs font-medium text-slate-400 uppercase tracking-wide">
                {date}
              </p>
              {convs.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeId}
                  isEditing={editingId === conv.id}
                  editValue={editValue}
                  onSelect={() => onSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onStartEdit={() => startEdit(conv)}
                  onEditChange={setEditValue}
                  onCommitEdit={() => commitEdit(conv.id)}
                  onCancelEdit={cancelEdit}
                />
              ))}
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}

interface ItemProps {
  conv: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

function ConversationItem({
  conv,
  isActive,
  isEditing,
  editValue,
  onSelect,
  onDelete,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
}: ItemProps) {
  const preview =
    conv.messages[conv.messages.length - 1]?.content ?? 'No messages';

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2 px-3 py-2 cursor-pointer',
        isActive ? 'bg-white border-r-2 border-indigo-500' : 'hover:bg-slate-100'
      )}
      onClick={onSelect}
    >
      <MessageSquare
        size={14}
        className="mt-0.5 shrink-0 text-slate-400"
      />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="flex-1 min-w-0 text-xs border border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              autoFocus
            />
            <button onClick={onCommitEdit} className="text-emerald-600 hover:text-emerald-700">
              <Check size={12} />
            </button>
            <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-slate-800 truncate">
              {truncate(conv.title, 28)}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {truncate(preview, 30)}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div
          className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onStartEdit}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-slate-400 hover:text-red-500 rounded"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
