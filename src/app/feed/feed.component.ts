import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Page, View } from '@nativescript/core';
import { bang, grow, press, pulse, rise, NsEvent, viewOf } from '../core/animate';
import { BriefService } from '../core/brief.service';
import { LayoutService } from '../core/layout.service';
import { Story } from '../core/models';
import { NotificationsService } from '../core/notifications.service';
import { StoriesService, timeAgo } from '../core/stories.service';
import { ThemeService } from '../core/theme.service';
import { StoryViewComponent } from '../story/story-view.component';

@Component({
  selector: 'ns-feed',
  templateUrl: './feed.component.html',
  imports: [StoryViewComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class FeedComponent {
  private router = inject(RouterExtensions);
  private service = inject(StoriesService);
  private notifications = inject(NotificationsService);
  readonly layout = inject(LayoutService);
  readonly stories = this.service.top;
  readonly changes = this.service.changes;
  readonly followed = this.service.followed;
  readonly brief = inject(BriefService);
  readonly showChanges = signal(true);
  /** Story shown in the right pane on wide screens. */
  readonly selected = signal<string | null>(null);
  readonly current = computed(() => this.selected() ?? this.stories()[0]?.id ?? null);
  private theme = inject(ThemeService);
  readonly timeAgo = timeAgo;
  readonly today = new Date()
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
  private announced = false;

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  onLoaded() {
    this.theme.apply();
    // One "última hora" alert per launch for the hottest auge.
    const top = this.stories()[0];
    if (!this.announced && top) {
      this.announced = true;
      setTimeout(() => this.notifications.breaking(top), 1500);
    }
  }

  async onRefresh(e: NsEvent) {
    await this.service.refresh();
    (viewOf(e) as View & { refreshing: boolean }).refreshing = false;
  }

  onLayout(e: NsEvent) {
    this.layout.update(viewOf(e).getActualSize().width);
  }

  bang(e: NsEvent) {
    bang(viewOf(e));
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }

  pulse(e: NsEvent) {
    pulse(viewOf(e));
  }

  grow(e: NsEvent, delay: number) {
    grow(viewOf(e), delay);
  }

  /** Tab roots (explore) replace the stack like the tab bar does. */
  go(path: string) {
    this.router.navigate([path], { clearHistory: true, transition: { name: 'fade', duration: 180 } });
  }

  async open(e: NsEvent, story: Story) {
    await press(viewOf(e));
    if (this.layout.wide()) this.selected.set(story.id);
    else this.router.navigate(['/story', story.id], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }
}
