import { Component, NO_ERRORS_SCHEMA, computed, effect, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { CoreTypes, Page, View } from '@nativescript/core';
import { shareText } from '@nativescript/social-share';
import { bang, breathe, followPop, grow, press, pulse, rise, NsEvent, viewOf, fadeInPhoto, shimmer, heartbeat } from '../core/animate';
import { BriefService } from '../core/brief.service';
import { IconName, icon } from '../core/icons';
import { ringSvg } from '../core/ring';
import { LayoutService } from '../core/layout.service';
import { Story } from '../core/models';
import { NotificationsService } from '../core/notifications.service';
import { StoriesService, timeAgo } from '../core/stories.service';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'ns-feed',
  templateUrl: './feed.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class FeedComponent {
  private router = inject(RouterExtensions);
  private service = inject(StoriesService);
  private notifications = inject(NotificationsService);
  readonly layout = inject(LayoutService);
  /** Infinite feed (X style): the 7 main auges, then 15 more each time you near the bottom. */
  private shown = signal(7);
  readonly stories = computed(() => this.service.pool().slice(0, this.shown()));
  readonly loadingMore = signal(false);
  readonly changes = this.service.changes;
  readonly followed = this.service.followed;
  readonly brief = inject(BriefService);
  readonly showChanges = signal(true);
  private theme = inject(ThemeService);
  readonly timeAgo = timeAgo;
  readonly today = new Date()
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
  private announced = false;

  private scroller?: View & { scrollToVerticalOffset(y: number, animated: boolean): void };

  constructor() {
    inject(Page).actionBarHidden = true;
    // Tab re-tapped: glide back to the top.
    effect(() => {
      if (this.layout.scrollTopTick()) this.scroller?.scrollToVerticalOffset(0, true);
    });
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

  /** Near the bottom: next page, fetching older auges when today's run out. */
  scrollerReady(e: NsEvent) {
    this.scroller = viewOf(e) as View & { scrollToVerticalOffset(y: number, animated: boolean): void };
  }

  async onScroll(e: NsEvent) {
    this.scroller = viewOf(e) as View & { scrollToVerticalOffset(y: number, animated: boolean): void };
    const sv = viewOf(e) as unknown as { scrollableHeight: number; verticalOffset: number };
    if (this.loadingMore() || sv.scrollableHeight - sv.verticalOffset > 600) return;
    this.loadingMore.set(true);
    const started = Date.now();
    if (this.shown() >= this.service.pool().length) await this.service.fetchOlder();
    // A visible beat of loading, like X: feels like fetching, not a dump.
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
    this.shown.set(Math.min(this.shown() + 15, this.service.pool().length));
    // Short cooldown so one flick of the finger loads one page.
    setTimeout(() => this.loadingMore.set(false), 600);
  }

  onLayout(e: NsEvent) {
    this.layout.update(viewOf(e).getActualSize().width);
  }

  bang(e: NsEvent) {
    bang(viewOf(e));
  }

  /** Escuchar Auges: a beat on tap, then start the headlines. */
  async listenTap(e: NsEvent) {
    this.brief.playHeadlines();
    await heartbeat(viewOf(e), true);
  }

  shimmer(e: NsEvent) {
    shimmer(viewOf(e));
  }

  fadeIn(e: NsEvent) {
    fadeInPhoto(viewOf(e));
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

  private get dark() {
    return this.theme.mode() === 'dark';
  }
  private get muted() {
    return this.dark ? '#8f8f8f' : '#737373';
  }

  ringSvg(heat: number) {
    return ringSvg(heat, this.dark, 48);
  }

  iconSvg(name: IconName, active: boolean, color: string | null) {
    return icon(name, color ?? this.muted, active);
  }

  shareSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${this.muted}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>`;
  }

  /** Avatar ring spins in; the hottest (≥90) keep breathing. */
  ringIn(e: NsEvent, heat: number, i: number) {
    const v = viewOf(e);
    v.rotate = -90;
    v.scaleX = v.scaleY = 0.7;
    v.animate({ rotate: 0, scale: { x: 1, y: 1 }, duration: 900, delay: 200 + i * 90, curve: CoreTypes.AnimationCurve.cubicBezier(0.16, 1, 0.3, 1) })
      .then(() => {
        if (heat >= 90) breathe(v);
      })
      .catch(() => {});
  }

  async follow(e: NsEvent, s: Story) {
    this.service.toggleFollow(s.id);
    await followPop(viewOf(e), this.service.followed().has(s.id));
  }

  share(e: NsEvent, s: Story) {
    press(viewOf(e));
    shareText(`#${s.tag} — ${s.brief}

Visto en Auge! · ${s.sources[0]?.url ?? ''}`, 'Compartir auge');
  }

  /** Tab roots (explore) replace the stack like the tab bar does. */
  go(path: string) {
    this.router.navigate([path], { clearHistory: true, transition: { name: 'fade', duration: 180 } });
  }

  async open(e: NsEvent, story: Story) {
    await press(viewOf(e));
    this.router.navigate(['/story', story.id], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }
}
