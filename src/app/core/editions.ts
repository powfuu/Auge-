import { Device } from '@nativescript/core';

/** News editions, one per language (see supabase/functions/ingest-news). */
export type Edition = 'es' | 'en' | 'de' | 'fr' | 'pt' | 'it' | 'ja' | 'zh' | 'ko';

export const EDITIONS: { id: Edition; label: string; region: string }[] = [
  { id: 'es', label: 'Español', region: 'España y Latinoamérica' },
  { id: 'en', label: 'English', region: 'US, UK, global' },
  { id: 'de', label: 'Deutsch', region: 'Deutschland, Schweiz, Österreich' },
  { id: 'fr', label: 'Français', region: 'France, Suisse, Belgique' },
  { id: 'pt', label: 'Português', region: 'Brasil, Portugal' },
  { id: 'it', label: 'Italiano', region: 'Italia' },
  { id: 'ja', label: '日本語', region: '日本' },
  { id: 'zh', label: '中文', region: '中国、台湾、新加坡' },
  { id: 'ko', label: '한국어', region: '대한민국' },
];

/** Edition matching the device language; English for anything we don't cover yet. */
export function deviceEdition(): Edition {
  const lang = (Device.language || 'en').slice(0, 2).toLowerCase();
  return (EDITIONS.find((e) => e.id === lang)?.id ?? 'en') as Edition;
}

