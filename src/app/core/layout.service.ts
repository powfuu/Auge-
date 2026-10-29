import { Injectable, computed, signal } from '@angular/core';
import { Screen } from '@nativescript/core';

/** Width at which we switch to two panes (tablets, foldables, dual-screen devices). */
const WIDE = 600;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly width = signal(Screen.mainScreen.widthDIPs);
  /** Two-pane mode. On dual-screen devices (e.g. Surface Duo) spanned across both
   *  screens, the two equal columns land one on each side of the hinge. */
  readonly wide = computed(() => this.width() >= WIDE);
  readonly gridColumns = computed(() => (this.wide() ? 5 : 3));

  /** Feed from the root view's layoutChanged so rotation and spanning are picked up. */
  update(width: number) {
    if (width > 0) this.width.set(width);
  }
}
