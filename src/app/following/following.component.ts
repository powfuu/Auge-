import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Page } from '@nativescript/core';
import { NsEvent, press, rise, viewOf } from '../core/animate';
import { StoriesService, timeAgo } from '../core/stories.service';
import { StoryViewComponent } from '../story/story-view.component';

/** Followed auges: pick one from the strip and see everything about it below. */
@Component({
  selector: 'ns-following',
  templateUrl: './following.component.html',
  imports: [StoryViewComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class FollowingComponent {
  private service = inject(StoriesService);
  readonly stories = this.service.followedStories;
  private picked = signal<string | null>(null);
  /** The picked auge, or the first one if the pick was unfollowed. */
  readonly selected = computed(() => {
    const list = this.stories();
    return list.find((s) => s.id === this.picked())?.id ?? list[0]?.id ?? null;
  });
  readonly timeAgo = timeAgo;

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  async pick(e: NsEvent, id: string) {
    this.picked.set(id);
    await press(viewOf(e));
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }
}
