import { Injectable, inject, signal } from '@angular/core';
import { LocalNotifications } from '@nativescript/local-notifications';
import { PrefsService } from './prefs.service';
import { Story } from './models';

export interface InboxItem {
  id: number;
  storyId?: string;
  title: string;
  body: string;
  at: Date;
  read: boolean;
}

let nextId = 1;

/**
 * Local notifications + an in-app inbox. Until a backend pushes real changes,
 * alerts are raised on-device from follow actions and from the facts still "en desarrollo".
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private prefs = inject(PrefsService);
  readonly inbox = signal<InboxItem[]>([]);
  readonly unread = () => this.inbox().filter((i) => !i.read).length;

  async requestPermission() {
    try {
      return await LocalNotifications.requestPermission();
    } catch {
      return false;
    }
  }

  /** Called when the user follows a story: confirms in the inbox and announces pending developments. */
  onFollow(story: Story) {
    if (!this.prefs.prefs().notifyFollowed) return;
    const pending = story.facts.filter((f) => f.certainty !== 'confirmed').length;
    this.push(
      `Sigues #${story.tag}`,
      pending ? `Te avisaremos de ${pending} punto${pending > 1 ? 's' : ''} aún sin confirmar.` : 'Te avisaremos si hay cambios importantes.',
      story.id,
    );
  }

  /** Breaking alert for the hottest story, if the user wants them. */
  breaking(story: Story) {
    if (!this.prefs.prefs().notifyBreaking) return;
    this.push(`Auge! · #${story.tag}`, story.brief, story.id);
  }

  markAllRead() {
    this.inbox.update((items) => items.map((i) => ({ ...i, read: true })));
  }

  push(title: string, body: string, storyId?: string) {
    const item: InboxItem = { id: nextId++, storyId, title, body, at: new Date(), read: false };
    this.inbox.update((items) => [item, ...items]);
    if (this.inQuietHours()) return;
    LocalNotifications.schedule([{ id: item.id, title, body, forceShowWhenInForeground: true }]).catch(() => {});
  }

  private inQuietHours() {
    const h = new Date().getHours();
    return this.prefs.prefs().quietHours && (h >= 23 || h < 8);
  }
}
