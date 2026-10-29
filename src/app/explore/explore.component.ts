import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { CATEGORIES } from '../core/categories';
import { RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import { LayoutService } from '../core/layout.service';
import { NsEvent, press, rise, viewOf } from '../core/animate';
import { Category, Story } from '../core/models';
import { StoriesService } from '../core/stories.service';

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
  /** Square tile side: 3 per row on phones, 5 on tablets and dual screens. */
  readonly tile = computed(() => Math.floor(this.layout.width() / this.layout.gridColumns()));
  readonly categories = CATEGORIES;
  readonly category = signal<Category | null>(null);
  readonly filtered = computed(() => this.stories().filter((s) => !this.category() || s.category === this.category()));

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  onLayout(e: NsEvent) {
    this.layout.update(viewOf(e).getActualSize().width);
  }

  back() {
    this.router.back();
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }

  async open(e: NsEvent, story: Story) {
    await press(viewOf(e));
    this.router.navigate(['/story', story.id], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }
}
