import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { AuthService } from './auth.service';
import { deviceEdition } from './editions';
import { Story } from './models';
import { NotificationsService } from './notifications.service';
import { PrefsService } from './prefs.service';
import { updateWidget } from './widget';
import RAW from './stories.json';

/** How many auges the home feed shows; the rest live in "Ver todos los auges". */
const TOP = 7;
const FOLLOW_KEY = 'followed';

// Offline fallback: hand-curated events from 29 Oct 2026, shown until the live feed loads
// (or when there is no connection). Live stories come from Supabase (supabase/functions/ingest-news).
type RawStory = Omit<Story, 'updatedAt' | 'timeline'> & { minutesAgo: number; timeline: { minutesAgo: number; text: string }[] };
const ago = (m: number) => new Date(Date.now() - m * 60_000);
const load = (): Story[] => (RAW as RawStory[])
  .map(({ minutesAgo, timeline, ...s }) => ({
    ...s,
    image: coverOf(s),
    updatedAt: ago(minutesAgo),
    timeline: timeline.map((t) => ({ at: ago(t.minutesAgo), text: t.text })),
  }))
  .sort((a, b) => b.heat - a.heat);

const LAST_VISIT_KEY = 'lastVisit';
const LIVE_LIMIT = 60;

/** Row shape of public.stories (see supabase/news.sql). */
interface StoryRow {
  id: string;
  tag: string;
  region: string;
  category: Story['category'];
  heat: number;
  brief: string;
  facts: Story['facts'];
  sources: Story['sources'];
  topics: string[];
  timeline: { at: string; text: string }[];
  media: Story['media'];
  claims: Story['claims'];
  posts: Story['posts'];
  pulse: Story['pulse'] | null;
  image: string | null;
  country: string | null;
  countries: string[];
  clustered: number;
  updated_at: string;
}

/** Cover photo, or the first attached photo when the story has no cover. */
const coverOf = (s: Pick<Story, 'image' | 'media'>) => s.image || s.media.find((m) => m.type === 'image')?.url || null;

const fromRow = (r: StoryRow): Story => ({
  ...r,
  image: coverOf(r),
  pulse: r.pulse ?? undefined,
  updatedAt: new Date(r.updated_at),
  timeline: r.timeline.map((t) => ({ at: new Date(t.at), text: t.text })),
});

/** The same event re-clustered on another day comes back with a new id: keep its newest version only. */
const storyKey = (s: Story) => s.tag.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 6).join(' ');
export function uniqueStories(list: Story[]): Story[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = storyKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

@Injectable({ providedIn: 'root' })
export class StoriesService {
  private prefs = inject(PrefsService);
  private notifications = inject(NotificationsService);
  private auth = inject(AuthService);

  readonly stories = signal<Story[]>(load());
  /** Edition shown: the user's choice, else the device language. */
  readonly edition = computed(() => this.prefs.prefs().edition ?? deviceEdition());
  /** True once the live feed has replaced the offline fallback. */
  readonly live = signal(false);
  /** Past auges of this edition, loaded on demand by the infinite feed and grid. */
  readonly older = signal<Story[]>([]);
  private olderDone = false;
  private olderOffset = 0;
  private loadingOlder = false;
  /** Today's auges then older ones, in the user's categories. */
  readonly pool = computed(() => {
    const cats = this.prefs.prefs().categories;
    return uniqueStories([...this.stories(), ...this.older()]).filter((s) => !cats.length || cats.includes(s.category));
  });

  /** Home feed: one per language (all Spanish-speaking countries together, etc.), hottest first. */
  readonly top = computed(() => {
    const cats = this.prefs.prefs().categories;
    return this.stories()
      .filter((s) => !cats.length || cats.includes(s.category))
      .slice(0, TOP);
  });
  readonly followed = signal<ReadonlySet<string>>(new Set(JSON.parse(ApplicationSettings.getString(FOLLOW_KEY, '[]'))));
  readonly followedStories = computed(() => this.stories().filter((s) => this.followed().has(s.id)));

  /** Previous app open; "¿Qué cambió?" lists timeline entries newer than this. */
  readonly lastVisit = new Date(ApplicationSettings.getNumber(LAST_VISIT_KEY, Date.now() - 6 * 3_600_000));
  readonly changes = computed(() =>
    this.stories()
      .flatMap((s) => s.timeline.filter((t) => t.at > this.lastVisit).map((t) => ({ story: s, ...t })))
      .sort((a, b) => b.at.getTime() - a.at.getTime()),
  );

  constructor() {
    ApplicationSettings.setNumber(LAST_VISIT_KEY, Date.now());
    effect(() => updateWidget(this.top()));
    // Load (and reload when the edition changes).
    effect(() => {
      this.edition();
      untracked(() => this.fetchLive());
    });
  }

  /** Loads the current auges from Supabase; keeps what we have if it fails. */
  async fetchLive() {
    const db = this.auth.client;
    if (!db) return;
    const { data, error } = await db
      .from('stories')
      .select('id, tag, region, category, heat, brief, facts, sources, topics, timeline, media, claims, posts, pulse, image, country, countries, clustered, updated_at')
      .eq('active', true)
      .eq('lang', this.edition())
      .order('heat', { ascending: false })
      .limit(LIVE_LIMIT);
    if (error || !data?.length) return;
    this.stories.set((data as StoryRow[]).map(fromRow));
    this.older.set([]);
    this.olderDone = false;
    this.olderOffset = 0;
    this.live.set(true);
  }

  /** Pull-to-refresh: fetch the latest auges (keeps the spinner at least a moment so it doesn't flash). */
  async refresh() {
    await Promise.all([this.fetchLive(), new Promise((r) => setTimeout(r, 600))]);
  }

  /** Next page of past auges (retired from the live list), newest first. */
  async fetchOlder() {
    const db = this.auth.client;
    if (!db || this.olderDone || this.loadingOlder) return;
    this.loadingOlder = true;
    try {
      const from = this.olderOffset;
      const { data } = await db
        .from('stories')
        .select('id, tag, region, category, heat, brief, facts, sources, topics, timeline, media, claims, posts, pulse, image, country, countries, clustered, updated_at')
        .eq('active', false)
        .eq('lang', this.edition())
        .order('updated_at', { ascending: false })
        .range(from, from + 39);
      const rows = (data as StoryRow[] | null) ?? [];
      this.olderOffset += rows.length;
      if (rows.length < 40) this.olderDone = true;
      const seen = new Set([...this.stories(), ...this.older()].map((x) => x.id));
      this.older.set([...this.older(), ...rows.filter((r) => !seen.has(r.id)).map(fromRow)]);
    } finally {
      this.loadingOlder = false;
    }
  }

  byId(id: string) {
    return this.stories().find((s) => s.id === id) ?? this.older().find((s) => s.id === id);
  }

  toggleFollow(id: string) {
    const next = new Set(this.followed());
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      const story = this.byId(id);
      if (story) this.notifications.onFollow(story);
    }
    this.setFollowed(next);
  }

  /** Replaces the followed set (also used by SyncService after pulling from the account). */
  setFollowed(ids: ReadonlySet<string>) {
    this.followed.set(ids);
    ApplicationSettings.setString(FOLLOW_KEY, JSON.stringify([...ids]));
  }
}

export function timeAgo(d: Date): string {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}
