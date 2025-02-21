import { supabase } from './supabase';
import type { User } from '../types';

let authRequest: Promise<any> | null = null;

export async function signUp(email: string, password: string) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }

  // Use a single auth request to prevent multiple simultaneous calls
  if (authRequest) return authRequest;

  authRequest = supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    }
  }).then(async ({ data: authData, error: signUpError }) => {
    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        throw new Error('This email is already registered. Please sign in instead.');
      }
      throw signUpError;
    }

    // Create profile for the new user
    if (authData.user) {
      try {
        await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: authData.user.email,
          });
      } catch (profileError) {
        console.error('Error creating profile:', profileError);
        // Don't throw here as the user is already created
      }
    }

    return authData;
  }).finally(() => {
    authRequest = null;
  });

  return authRequest;
}

export async function signIn(email: string, password: string) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  // Use a single auth request to prevent multiple simultaneous calls
  if (authRequest) return authRequest;

  authRequest = supabase.auth.signInWithPassword({
    email,
    password,
  }).then(({ data, error }) => {
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password. Please try again.');
      }
      throw error;
    }
    return data;
  }).finally(() => {
    authRequest = null;
  });

  return authRequest;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return profile;
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session?.user?.id)
        .single();
      
      callback(profile);
    } else if (event === 'SIGNED_OUT') {
      callback(null);
    }
  });
}