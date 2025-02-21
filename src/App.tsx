import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquarePlus, Moon, Sun, X, Send, Paperclip, Loader2, AlertCircle } from 'lucide-react';
import { useChatStore } from './store';
import { supabase } from './lib/supabase';
import { MODELS } from './lib/utils';
import { signIn, signUp, signOut, getCurrentUser } from './lib/auth';
import { createConversation, sendMessage, subscribeToMessages, getMessages, getConversations } from './lib/api';
import { generateAIResponse, streamAIResponse } from './lib/ai';
import { Message } from './types';
import { formatDate } from './lib/utils';

let authTimeout: NodeJS.Timeout;

function App() {
  const {
    isDarkMode,
    toggleDarkMode,
    isAuthenticated,
    setIsAuthenticated,
    selectedModel,
    setSelectedModel,
    conversations,
    setConversations,
    messages,
    setMessages,
    addMessage,
    currentConversation,
    setCurrentConversation,
    setUser,
  } = useChatStore();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    getCurrentUser().then(user => {
      setUser(user);
      setIsAuthenticated(!!user);
      if (user) {
        getConversations().then(setConversations);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session?.user?.id)
          .single();
        
        setUser(profile);
        setIsAuthenticated(true);
        getConversations().then(setConversations);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        setCurrentConversation(null);
        setMessages([]);
        setConversations([]);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentConversation) {
      getMessages(currentConversation.id).then(setMessages);

      const channel = subscribeToMessages(currentConversation.id, (message) => {
        addMessage(message);
      });

      return () => {
        channel.unsubscribe();
      };
    } else {
      setMessages([]);
    }
  }, [currentConversation]);

  const validateForm = () => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!password.trim()) {
      setError('Password is required');
      return false;
    }
    if (isRegistering && password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    return true;
  };

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    // Clear any existing timeout
    if (authTimeout) {
      clearTimeout(authTimeout);
    }

    setLoading(true);

    // Set a timeout to show an error if auth takes too long
    authTimeout = setTimeout(() => {
      setError('Authentication is taking longer than expected. Please try again.');
      setLoading(false);
    }, 10000);

    try {
      if (isRegistering) {
        await signUp(email.trim(), password);
        setShowAuthModal(false);
        setError('');
      } else {
        await signIn(email.trim(), password);
        setShowAuthModal(false);
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      clearTimeout(authTimeout);
      setLoading(false);
    }
  }, [email, password, isRegistering, validateForm]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error signing out:', err);
      setError('Failed to sign out. Please try again.');
    }
  };

  const generateTitle = (content: string): string => {
    const words = content.split(' ').slice(0, 4);
    return words.join(' ') + (words.length >= 4 ? '...' : '');
  };

  const handleNewChat = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    try {
      const newConversation = await createConversation('New Chat', selectedModel);
      setCurrentConversation(newConversation);
      setConversations([newConversation, ...conversations]);
      setMessages([]);
    } catch (err) {
      console.error('Error creating new chat:', err);
      setError('Failed to create new chat. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentConversation || !isAuthenticated) return;

    setIsSending(true);
    setError('');
    try {
      const userMessage = await sendMessage(
        currentConversation.id,
        messageInput.trim(),
        'user'
      );
      setMessageInput('');

      // Update conversation title if it's the first message
      if (messages.length === 0) {
        const newTitle = generateTitle(messageInput.trim());
        const { data: updatedConv } = await supabase
          .from('conversations')
          .update({ title: newTitle })
          .eq('id', currentConversation.id)
          .select()
          .single();
        
        if (updatedConv) {
          setConversations(conversations.map(conv =>
            conv.id === updatedConv.id ? updatedConv : conv
          ));
          setCurrentConversation(updatedConv);
        }
      }

      // Get conversation history for context
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Use streaming response
      const stream = streamAIResponse(messageInput.trim(), currentConversation.model, history);
      let finalContent = '';

      for await (const chunk of stream) {
        setStreamingContent(chunk.content);
        if (chunk.done) {
          finalContent = chunk.content;
          setStreamingContent('');
        }
        if (chunk.error) {
          console.error('AI Error:', chunk.error);
          setError('Failed to get AI response. Please try again.');
          break;
        }
      }

      if (finalContent) {
        await sendMessage(
          currentConversation.id,
          finalContent,
          'assistant'
        );
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
      setStreamingContent('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`h-screen flex ${isDarkMode ? 'dark' : ''}`}>
      {/* Sidebar */}
      <aside className="w-[280px] bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4">
          <button
            onClick={handleNewChat}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-2 flex items-center justify-center gap-2"
          >
            <MessageSquarePlus size={20} />
            New Chat
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as keyof typeof MODELS)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-2"
          >
            {Object.entries(MODELS).map(([id, { name }]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setCurrentConversation(conversation)}
              className={`p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer mb-2 ${
                currentConversation?.id === conversation.id
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : ''
              }`}
            >
              <h3 className="font-medium truncate">{conversation.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {conversation.last_message}
              </p>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg p-2"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg p-2"
            >
              Login / Register
            </button>
          )}
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col bg-white dark:bg-gray-950">
        <header className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4">
          <h2 className="text-lg font-semibold">
            {currentConversation?.title || 'New Chat'}
          </h2>
          <button
            onClick={toggleDarkMode}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message: Message) => (
            <div
              key={message.id}
              className={`mb-4 ${
                message.role === 'user' ? 'ml-auto' : 'mr-auto'
              }`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                {message.content}
                {message.file_url && (
                  <a
                    href={message.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-2 text-sm underline"
                  >
                    Attached File
                  </a>
                )}
                <div className="text-xs mt-1 opacity-70">
                  {formatDate(message.created_at)}
                </div>
              </div>
            </div>
          ))}
          {streamingContent && (
            <div className="mb-4 mr-auto">
              <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                {streamingContent}
                <span className="typing-indicator" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          {error && (
            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg flex items-center">
              <AlertCircle size={16} className="mr-2 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError('')}
                className="text-red-700 hover:text-red-900 ml-2"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            {MODELS[selectedModel].supportsFiles && (
              <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <Paperclip size={20} />
              </button>
            )}
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isAuthenticated ? "Type your message..." : "Please sign in to chat"}
              disabled={!isAuthenticated || isSending}
              className="flex-1 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={handleSendMessage}
              disabled={!isAuthenticated || !messageInput.trim() || isSending}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 disabled:opacity-50 flex items-center gap-2"
            >
              {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md relative">
            {loading && (
              <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center rounded-lg z-10">
                <div className="flex flex-col items-center">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Authenticating...
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {isRegistering ? 'Create Account' : 'Sign In'}
              </h2>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-0 rounded-lg p-2"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border-0 rounded-lg p-2"
                  required
                  minLength={6}
                />
                {isRegistering && (
                  <p className="text-sm text-gray-500 mt-1">
                    Password must be at least 6 characters long
                  </p>
                )}
              </div>

              {error && (
                <div className="p-2 bg-red-100 text-red-700 rounded-lg flex items-center">
                  <AlertCircle size={16} className="mr-2" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  isRegistering ? 'Create Account' : 'Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
                className="w-full text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {isRegistering
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Create one"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;