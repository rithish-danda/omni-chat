import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODELS } from './utils';

export type AIResponse = {
  content: string;
  error?: string;
};

export type AIStreamResponse = {
  content: string;
  done: boolean;
  error?: string;
};

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

async function generateOpenAIResponse(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return { content: completion.choices[0].message.content || '' };
  } catch (error) {
    console.error('OpenAI error:', error);
    return {
      content: 'I apologize, but I encountered an error processing your request.',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function generateGeminiResponse(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const chat = model.startChat({
      history: conversationHistory.map(msg => ({
        role: msg.role,
        parts: msg.content,
      })),
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    return { content: response.text() };
  } catch (error) {
    console.error('Gemini error:', error);
    return {
      content: 'I apologize, but I encountered an error processing your request.',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function generateDeepseekResponse(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  try {
    const response = await fetch(import.meta.env.VITE_DEEPSEEK_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deepseek API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { content: data.choices[0].message.content };
  } catch (error) {
    console.error('Deepseek error:', error);
    return {
      content: 'I apologize, but I encountered an error processing your request.',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function* streamDeepseekResponse(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<AIStreamResponse> {
  try {
    const response = await fetch(import.meta.env.VITE_DEEPSEEK_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deepseek API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let accumulatedContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          const content = data.choices[0].delta.content || '';
          accumulatedContent += content;
          yield { content: accumulatedContent, done: false };
        }
      }
    }

    yield { content: accumulatedContent, done: true };
  } catch (error) {
    yield {
      content: 'I apologize, but I encountered an error processing your request.',
      done: true,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function generateAIResponse(
  message: string,
  model: keyof typeof MODELS,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AIResponse> {
  switch (model) {
    case 'gemini':
      return generateGeminiResponse(message, conversationHistory);
    case 'deepseek-chat':
      return generateDeepseekResponse(message, conversationHistory);
    default:
      return generateOpenAIResponse(message, conversationHistory);
  }
}

export async function* streamAIResponse(
  message: string,
  model: keyof typeof MODELS,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<AIStreamResponse> {
  switch (model) {
    case 'gemini': {
      const response = await generateGeminiResponse(message, conversationHistory);
      yield { content: response.content, done: true, error: response.error };
      return;
    }
    case 'deepseek-chat':
      yield* streamDeepseekResponse(message, conversationHistory);
      return;
    default:
      try {
        const stream = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful AI assistant.' },
            ...conversationHistory,
            { role: 'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: true,
        });

        let accumulatedContent = '';
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          accumulatedContent += content;
          yield { content: accumulatedContent, done: false };
        }
        yield { content: accumulatedContent, done: true };
      } catch (error) {
        yield {
          content: 'I apologize, but I encountered an error processing your request.',
          done: true,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
      }
  }
}