import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { CATEGORIES } from '../core/categories';
import { RouterExtensions } from '@nativescript/angular';
import { CoreTypes, Page } from '@nativescript/core';
import { ringSvg } from '../core/ring';
import { ThemeService } from '../core/theme.service';
import { LayoutService } from '../core/layout.service';
import { NsEvent, breathe, press, rise, viewOf, fadeInPhoto, shimmer } from '../core/animate';
import { Category, Story } from '../core/models';
import { StoriesService, uniqueStories } from '../core/stories.service';

/** "Ver todos los auges": every current auge as borderless square tiles, 3 per row. */
@Component({
  selector: 'ns-explore',
  templateUrl: './explore.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class ExploreComponent {
  private router = inject(RouterExtensions);
  private service = inject(StoriesService);
  readonly stories = this.service.stories;
  readonly followed = this.service.followed;
  private layout = inject(LayoutService);
  private theme = inject(ThemeService);
  /** Square tile side: 3 per row on phones, 5 on tablets and dual screens. */
  readonly tile = computed(() => Math.floor(this.layout.width() / this.layout.gridColumns()));
  readonly categories = CATEGORIES;
  readonly category = signal<Category | null>(null);
  private shown = signal(45);
  readonly loadingMore = signal(false);
  /** Infinite grid: today's auges, then older ones, 45 at a time. */
  readonly filtered = computed(() =>
    uniqueStories([...this.stories(), ...this.service.older()]).filter((s) => !this.category() || s.category === this.category()).slice(0, this.shown()),
  );

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  async onScroll(e: NsEvent) {
    const sv = viewOf(e) as unknown as { scrollableHeight: number; verticalOffset: number };
    if (this.loadingMore() || sv.scrollableHeight - sv.verticalOffset > 600) return;
    this.loadingMore.set(true);
    const started = Date.now();
    if (this.shown() >= this.stories().length + this.service.older().length) await this.service.fetchOlder();
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
    this.shown.set(this.shown() + 45);
    setTimeout(() => this.loadingMore.set(false), 600);
  }

  onLayout(e: NsEvent) {
    this.layout.update(viewOf(e).getActualSize().width);
  }

  back() {
    this.router.back();
  }

  ringSvg(heat: number) {
    return ringSvg(heat, this.theme.mode() === 'dark');
  }

  /** Ring spins in; the hottest (≥90) keep breathing. */
  ring(e: NsEvent, heat: number, i: number) {
    const v = viewOf(e);
    v.rotate = -90;
    v.scaleX = v.scaleY = 0.7;
    v.animate({ rotate: 0, scale: { x: 1, y: 1 }, duration: 900, delay: 150 + i * 40, curve: CoreTypes.AnimationCurve.cubicBezier(0.16, 1, 0.3, 1) })
      .then(() => {
        if (heat >= 90) breathe(v);
      })
      .catch(() => {});
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

  async open(e: NsEvent, story: Story) {
    await press(viewOf(e));
    this.router.navigate(['/story', story.id], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }
}
