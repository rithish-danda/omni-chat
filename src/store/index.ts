import { create } from 'zustand';
import { Conversation, Message, Model, User } from '../types';

interface ChatStore {
  user: User | null;
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  selectedModel: Model['id'];
  isDarkMode: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setSelectedModel: (model: Model['id']) => void;
  toggleDarkMode: () => void;
  setIsAuthenticated: (value: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  user: null,
  conversations: [],
  currentConversation: null,
  messages: [],
  selectedModel: 'gpt-3.5-turbo',
  isDarkMode: false,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message],
    conversations: state.conversations.map(conv =>
      conv.id === message.conversation_id
        ? { ...conv, last_message: message.content }
        : conv
    )
  })),
  setSelectedModel: (model) => set({ selectedModel: model }),
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),
}));