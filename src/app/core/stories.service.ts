import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { Story } from './models';
import { NotificationsService } from './notifications.service';
import { PrefsService } from './prefs.service';
import { updateWidget } from './widget';
import RAW from './stories.json';

/** How many auges the home feed shows; the rest live in "Ver todos los auges". */
const TOP = 7;
const FOLLOW_KEY = 'followed';

// Real events from 29 Oct 2026, hand-curated until the clustering backend exists.
// `heat` and `clustered` are editorial estimates; `posts` are simulated.
type RawStory = Omit<Story, 'updatedAt' | 'timeline'> & { minutesAgo: number; timeline: { minutesAgo: number; text: string }[] };
const ago = (m: number) => new Date(Date.now() - m * 60_000);
const load = (): Story[] => (RAW as RawStory[])
  .map(({ minutesAgo, timeline, ...s }) => ({
    ...s,
    updatedAt: ago(minutesAgo),
    timeline: timeline.map((t) => ({ at: ago(t.minutesAgo), text: t.text })),
  }))
  .sort((a, b) => b.heat - a.heat);

const LAST_VISIT_KEY = 'lastVisit';

@Injectable({ providedIn: 'root' })
export class StoriesService {
  private prefs = inject(PrefsService);
  private notifications = inject(NotificationsService);

  readonly stories = signal<Story[]>(load());
  /** Home feed: preferred categories only (all when none chosen), hottest first. */
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
  }

  /** Pull-to-refresh. Re-reads the curated data until a live feed exists. */
  async refresh() {
    await new Promise((r) => setTimeout(r, 900));
    this.stories.set(load());
  }

  byId(id: string) {
    return this.stories().find((s) => s.id === id);
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
