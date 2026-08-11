'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { credentials as credApi, type Credential } from '@/lib/api';

export function useCredentials() {
  const { data, isLoading, error, mutate } = useSWR<Credential[]>(
    '/credentials',
    () => credApi.list(),
  );
  const refresh = useCallback(() => mutate(), [mutate]);

  const save = async (provider: string, label: string, value: string, keyType: string = 'api_key') => {
    const result = await credApi.create({ provider, label, key_type: keyType, value });
    await mutate();
    return result;
  };

  const remove = async (id: string) => {
    await credApi.delete(id);
    await mutate();
  };

  const test = async (provider: string, label: string, value: string, keyType: string = 'api_key') => {
    return await credApi.test({ provider, label, key_type: keyType, value });
  };

  return { credentials: data ?? [], loading: isLoading, error: error?.message ?? null, refresh, save, remove, test };
}
