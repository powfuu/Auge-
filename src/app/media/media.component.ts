import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterExtensions } from '@nativescript/angular';
import { CoreTypes, Page, SwipeDirection, SwipeGestureEventData, Utils, View } from '@nativescript/core';
import { NsEvent, viewOf } from '../core/animate';
import { StoriesService } from '../core/stories.service';

/** Fullscreen viewer for an auge's photos and videos. Swipe to browse, tap the link to open the original. */
@Component({
  selector: 'ns-media',
  templateUrl: './media.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class MediaComponent {
  private router = inject(RouterExtensions);
  private route = inject(ActivatedRoute).snapshot.params;
  readonly story = inject(StoriesService).byId(this.route['id'])!;
  readonly index = signal(Number(this.route['index']) || 0);
  readonly item = computed(() => this.story.media[this.index()]);
  private stage?: View;

  constructor() {
    const page = inject(Page);
    page.actionBarHidden = true;
    page.backgroundColor = '#000000';
  }

  onStage(e: NsEvent) {
    this.stage = viewOf(e);
  }

  close() {
    this.router.back();
  }

  async swipe(e: NsEvent) {
    const dir = (e as SwipeGestureEventData).direction;
    if (dir === SwipeDirection.down) return this.close();
    const step = dir === SwipeDirection.left ? 1 : dir === SwipeDirection.right ? -1 : 0;
    const next = this.index() + step;
    if (!step || next < 0 || next >= this.story.media.length || !this.stage) return;
    const s = this.stage;
    await s.animate({ opacity: 0, translate: { x: -step * 60, y: 0 }, duration: 160 });
    this.index.set(next);
    s.translateX = step * 60;
    await s.animate({ opacity: 1, translate: { x: 0, y: 0 }, duration: 260, curve: CoreTypes.AnimationCurve.easeOut });
  }

  openOriginal() {
    const m = this.item();
    Utils.openUrl(m.type === 'image' ? m.page : m.url);
  }
}
