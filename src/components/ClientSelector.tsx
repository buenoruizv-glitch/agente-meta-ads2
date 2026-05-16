"use client";

import React from 'react';
import { useClient } from '@/contexts/ClientContext';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';

export function ClientSelector() {
  const { clients, currentClient, setCurrentClientId, isLoading } = useClient();
  const [isOpen, setIsOpen] = React.useState(false);

  if (isLoading || clients.length === 0) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-md">
        <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
        <div className="h-4 w-24 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full md:w-auto min-w-[200px] px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        <div className="flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="truncate max-w-[120px]">{currentClient?.name || 'Select Client'}</span>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full md:w-64 mt-1 bg-white rounded-md shadow-lg dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Tus Clientes
            </div>
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => {
                  setCurrentClientId(client.id);
                  setIsOpen(false);
                }}
                className={`flex items-center w-full px-4 py-2 text-sm text-left ${
                  currentClient?.id === client.id
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                role="menuitem"
              >
                <div className="flex-1 truncate">{client.name}</div>
                {currentClient?.id === client.id && (
                  <div className="w-2 h-2 rounded-full bg-indigo-500 ml-2"></div>
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              role="menuitem"
            >
              <Plus className="w-4 h-4 mr-2" />
              Añadir nuevo cliente
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
