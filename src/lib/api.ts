import { supabase } from './supabase';
import type { Conversation, Message } from '../types';

export async function createConversation(title: string, model: string) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      title,
      model,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function getConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data as Conversation[];
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as Message[];
}

export async function sendMessage(conversationId: string, content: string, role: 'user' | 'assistant', fileUrl?: string) {
  const messagePromise = supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      content,
      role,
      file_url: fileUrl,
    })
    .select()
    .single();

  const updatePromise = supabase
    .from('conversations')
    .update({ last_message: content })
    .eq('id', conversationId);

  const [messageResult, updateResult] = await Promise.all([messagePromise, updatePromise]);

  if (messageResult.error) throw messageResult.error;
  if (updateResult.error) throw updateResult.error;

  return messageResult.data as Message;
}

export function subscribeToMessages(conversationId: string, callback: (message: Message) => void) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => callback(payload.new as Message)
    )
    .subscribe();

  return channel;
}