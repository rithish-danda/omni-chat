import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MODELS: Record<string, { name: string; description: string; supportsFiles: boolean }> = {
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient language model from OpenAI',
    supportsFiles: false,
  },
  'gemini': {
    name: 'Gemini Pro',
    description: 'Advanced language model from Google',
    supportsFiles: true,
  },
  'deepseek-chat': {
    name: 'Deepseek Chat',
    description: 'Advanced conversational AI from Deepseek',
    supportsFiles: true,
  }
};

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(new Date(date));
}