import { Injectable, computed, signal } from '@angular/core';
import { ApplicationSettings, Utils } from '@nativescript/core';
import { SupabaseClient, User as SupabaseUser, createClient } from '@supabase/supabase-js';
import { randomAvatar } from './avatars';
import { onDeepLink } from './deep-links';
import { AUTH_REDIRECT, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type Provider = 'google' | 'apple';

export interface User {
  id: string;
  /** Visible name. */
  fullName: string;
  /** Unique handle, without the @. Empty until the user picks one. */
  username: string;
  /** Id from the avatar collection (avatars.ts). Profile pictures only; no banners. */
  avatarId: string;
  email?: string;
  phone?: string;
  provider: Provider;
  plan: 'free' | 'pro';
  since: Date;
}

export type ProfilePatch = Partial<Pick<User, 'fullName' | 'username' | 'avatarId'>>;

/** 3–20 chars: lowercase letters, numbers, underscore and dot. */
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

const DEMO_KEY = 'demoUser';

/** Supabase session storage backed by the device key-value store. */
const storage = {
  getItem: (k: string) => (ApplicationSettings.hasKey(k) ? ApplicationSettings.getString(k) : null),
  setItem: (k: string, v: string) => ApplicationSettings.setString(k, v),
  removeItem: (k: string) => ApplicationSettings.remove(k),
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Null while Supabase isn't configured (see config.ts): the app runs in demo mode. */
  readonly client: SupabaseClient | null =
    SUPABASE_URL && SUPABASE_ANON_KEY
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage, persistSession: true, detectSessionInUrl: false } })
      : null;
  readonly demo = !this.client;
  readonly user = signal<User | null>(null);
  readonly signedIn = computed(() => !!this.user());
  /** Signed in but hasn't chosen a @username yet → show profile setup. */
  readonly needsSetup = computed(() => !!this.user() && !this.user()!.username);

  constructor() {
    if (this.client) {
      onDeepLink((url) => this.handleRedirect(url));
      this.client.auth.onAuthStateChange((_e, session) => {
        if (session) this.loadProfile(session.user);
        else this.user.set(null);
      });
    } else if (ApplicationSettings.hasKey(DEMO_KEY)) {
      const saved = JSON.parse(ApplicationSettings.getString(DEMO_KEY));
      this.user.set({ ...saved, since: new Date(saved.since) });
    }
  }

  /** Google / Apple via Supabase OAuth in the system browser; it returns to AUTH_REDIRECT. */
  async signInWith(provider: Provider) {
    if (!this.client) return this.demoSignIn(provider, provider === 'google' ? 'Usuario de Google' : 'Usuario de Apple');
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined },
    });
    if (error) throw error;
    if (data.url) Utils.openUrl(data.url);
  }

  /** Finishes OAuth when the app is opened from AUTH_REDIRECT (?code=...). */
  async handleRedirect(url: string) {
    const code = /[?&]code=([^&]+)/.exec(url)?.[1];
    if (this.client && code) await this.client.auth.exchangeCodeForSession(decodeURIComponent(code));
  }

  async isUsernameFree(username: string) {
    if (!this.client) return true;
    const { count } = await this.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('username', username)
      .neq('id', this.user()?.id ?? '');
    return !count;
  }

  async updateProfile(patch: ProfilePatch) {
    const current = this.user();
    if (!current) return;
    if (this.client) {
      const { error } = await this.client
        .from('profiles')
        .update({ full_name: patch.fullName, username: patch.username, avatar_id: patch.avatarId })
        .eq('id', current.id);
      if (error) throw error.code === '23505' ? new Error('Ese @usuario ya está cogido.') : error;
    }
    const next = { ...current, ...patch };
    this.user.set(next);
    if (!this.client) ApplicationSettings.setString(DEMO_KEY, JSON.stringify(next));
  }

  async signOut() {
    if (this.client) await this.client.auth.signOut();
    ApplicationSettings.remove(DEMO_KEY);
    this.user.set(null);
  }

  private demoSignIn(provider: Provider, fullName: string) {
    const user: User = { id: 'demo', fullName, username: '', avatarId: randomAvatar(), provider, plan: 'free', since: new Date() };
    ApplicationSettings.setString(DEMO_KEY, JSON.stringify(user));
    this.user.set(user);
  }

  private async loadProfile(u: SupabaseUser) {
    const meta = u.user_metadata ?? {};
    const { data } = await this.client!.from('profiles').select('full_name, username, avatar_id, plan').eq('id', u.id).single();
    this.user.set({
      id: u.id,
      fullName: data?.full_name || meta['full_name'] || meta['name'] || '',
      username: data?.username ?? '',
      avatarId: data?.avatar_id ?? randomAvatar(),
      email: u.email,
      phone: u.phone,
      provider: (u.app_metadata.provider as Provider) ?? 'google',
      plan: data?.plan ?? 'free',
      since: new Date(u.created_at),
    });
  }
}
