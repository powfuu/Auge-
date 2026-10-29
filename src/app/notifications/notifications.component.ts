import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import { NsEvent, rise, viewOf } from '../core/animate';
import { InboxItem, NotificationsService } from '../core/notifications.service';
import { timeAgo } from '../core/stories.service';

@Component({
  selector: 'ns-notifications',
  templateUrl: './notifications.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class NotificationsComponent {
  private router = inject(RouterExtensions);
  private service = inject(NotificationsService);
  readonly inbox = this.service.inbox;
  readonly timeAgo = timeAgo;

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  onUnloaded() {
    this.service.markAllRead();
  }

  back() {
    this.router.back();
  }

  open(item: InboxItem) {
    if (item.storyId) this.router.navigate(['/story', item.storyId], { transition: { name: 'slide', duration: 320 } });
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }
}
