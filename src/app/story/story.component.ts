import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Page } from '@nativescript/core';
import { StoryViewComponent } from './story-view.component';

/** Phone route for a single auge. */
@Component({
  selector: 'ns-story',
  template: `<ns-story-view class="screen" androidOverflowEdge="none,cutout" [storyId]="id"></ns-story-view>`,
  imports: [StoryViewComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class StoryComponent {
  readonly id: string = inject(ActivatedRoute).snapshot.params['id'];

  constructor() {
    inject(Page).actionBarHidden = true;
  }
}
