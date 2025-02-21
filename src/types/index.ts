export type User = {
  id: string;
  email: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  file_url?: string;
};

export type Conversation = {
  id: string;
  title: string;
  user_id: string;
  model: 'gpt-3.5-turbo' | 'gemini' | 'deepseek-chat';
  created_at: string;
  last_message?: string;
};

export type Model = {
  id: 'gpt-3.5-turbo' | 'gemini' | 'deepseek-chat';
  name: string;
  description: string;
  supportsFiles: boolean;
};