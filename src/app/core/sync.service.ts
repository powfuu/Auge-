import { Injectable, effect, inject, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { Category } from './models';
import { Prefs, PrefsService } from './prefs.service';
import { StoriesService } from './stories.service';

interface PrefsRow {
  categories: Category[];
  notify_followed: boolean;
  notify_breaking: boolean;
  notify_digest: boolean;
  quiet_hours: boolean;
}

const toRow = (p: Prefs): PrefsRow => ({
  categories: p.categories,
  notify_followed: p.notifyFollowed,
  notify_breaking: p.notifyBreaking,
  notify_digest: p.notifyDigest,
  quiet_hours: p.quietHours,
});

const fromRow = (r: PrefsRow): Prefs => ({
  categories: r.categories,
  notifyFollowed: r.notify_followed,
  notifyBreaking: r.notify_breaking,
  notifyDigest: r.notify_digest,
  quietHours: r.quiet_hours,
});

/**
 * Keeps followed auges and preferences in Supabase while signed in.
 * On sign-in: followed = local ∪ remote; preferences = remote (the account wins over this device).
 * After that, every local change is pushed. Offline/failed pushes are retried on the next change.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private auth = inject(AuthService);
  private stories = inject(StoriesService);
  private prefs = inject(PrefsService);
  /** Follows as last confirmed by the server; null until the first pull finishes. */
  private remoteFollows: Set<string> | null = null;
  private userId: string | null = null;
  private prefsTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => this.onUser(id));
    });
    effect(() => {
      const followed = this.stories.followed();
      untracked(() => this.pushFollows(followed));
    });
    effect(() => {
      const prefs = this.prefs.prefs();
      untracked(() => this.pushPrefs(prefs));
    });
  }

  private get db() {
    return this.auth.client && this.userId ? this.auth.client : null;
  }

  private async onUser(id: string | null) {
    this.remoteFollows = null;
    this.userId = this.auth.demo ? null : id;
    if (!this.db) return;
    try {
      await this.pull();
    } catch {
      // Keep working locally; the next change retries.
    }
  }

  private async pull() {
    const db = this.db!;
    const [follows, prefs] = await Promise.all([
      db.from('follows').select('story_id'),
      db.from('user_prefs').select('categories, notify_followed, notify_breaking, notify_digest, quiet_hours').maybeSingle(),
    ]);
    if (follows.error) throw follows.error;
    if (prefs.error) throw prefs.error;

    this.remoteFollows = new Set(follows.data.map((r) => r.story_id as string));
    if (prefs.data) this.prefs.prefs.set(fromRow(prefs.data as PrefsRow));
    // Merge: anything followed on this device before signing in is kept and uploaded.
    const merged = new Set([...this.stories.followed(), ...this.remoteFollows]);
    this.stories.setFollowed(merged);
  }

  private async pushFollows(local: ReadonlySet<string>) {
    const db = this.db;
    const remote = this.remoteFollows;
    if (!db || !remote) return;
    const added = [...local].filter((id) => !remote.has(id));
    const removed = [...remote].filter((id) => !local.has(id));
    try {
      if (added.length) {
        const { error } = await db.from('follows').upsert(added.map((story_id) => ({ user_id: this.userId, story_id })));
        if (error) throw error;
        added.forEach((id) => remote.add(id));
      }
      if (removed.length) {
        const { error } = await db.from('follows').delete().in('story_id', removed);
        if (error) throw error;
        removed.forEach((id) => remote.delete(id));
      }
    } catch {
      // Left out of `remote`, so it's retried with the next change.
    }
  }

  /** Debounced so flipping several switches sends one write. */
  private pushPrefs(p: Prefs) {
    if (!this.db || !this.remoteFollows) return;
    clearTimeout(this.prefsTimer);
    this.prefsTimer = setTimeout(async () => {
      await this.db?.from('user_prefs').upsert({ user_id: this.userId, ...toRow(p), updated_at: new Date().toISOString() });
    }, 600);
  }
}
