"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface Client {
  id: string;
  name: string;
  meta_access_token?: string;
  meta_ad_account_id?: string;
  anthropic_api_key?: string;
  google_sheets_id?: string;
  settings: Record<string, any>;
  created_at: string;
}

interface ClientContextType {
  clients: Client[];
  currentClient: Client | null;
  setCurrentClientId: (id: string) => void;
  isLoading: boolean;
  refreshClients: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshClients = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching clients:', error);
        return;
      }

      setClients(data || []);
      
      // If we don't have a current client, or the current client is no longer in the list,
      // select the first one automatically
      if (data && data.length > 0) {
        let storedClientId = null;
        if (typeof window !== 'undefined') {
          storedClientId = localStorage.getItem('currentClientId');
        }
        
        const foundClient = data.find(c => c.id === storedClientId);
        
        if (foundClient) {
          setCurrentClient(foundClient);
        } else {
          setCurrentClient(data[0]);
          if (typeof window !== 'undefined') {
            localStorage.setItem('currentClientId', data[0].id);
          }
        }
      } else {
        setCurrentClient(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('currentClientId');
        }
      }
    } catch (error) {
      console.error('Exception fetching clients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshClients();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        refreshClients();
      } else {
        setClients([]);
        setCurrentClient(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const setCurrentClientId = (id: string) => {
    const client = clients.find(c => c.id === id);
    if (client) {
      setCurrentClient(client);
      if (typeof window !== 'undefined') {
        localStorage.setItem('currentClientId', id);
      }
    }
  };

  return (
    <ClientContext.Provider value={{ clients, currentClient, setCurrentClientId, isLoading, refreshClients }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
}
