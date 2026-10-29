import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { PageRouterOutlet, RouterExtensions } from '@nativescript/angular';
import { CoreTypes, View } from '@nativescript/core';
import { filter, map } from 'rxjs';
import { NsEvent, viewOf } from './core/animate';
import { AuthService } from './core/auth.service';
import { AvatarComponent } from './core/avatar.component';
import { IconName, icon } from './core/icons';
import { NotificationsService } from './core/notifications.service';
import { SyncService } from './core/sync.service';
import { ThemeService } from './core/theme.service';

const TABS: { path: string; icon: IconName }[] = [
  { path: '/feed', icon: 'auge' },
  { path: '/explore', icon: 'explore' },
  { path: '/following', icon: 'following' },
  { path: '/notifications', icon: 'alerts' },
  { path: '/profile', icon: 'person' },
];

@Component({
  selector: 'ns-app',
  template: `
    <GridLayout rows="*, auto">
      <page-router-outlet row="0"></page-router-outlet>

      <!-- Bottom tab bar, X style: thin outline icons, filled when active, no labels. -->
      @if (showTabs()) {
        <GridLayout row="1" columns="*, *, *, *, *" class="tabbar" androidOverflowEdge="bottom">
          @for (t of tabs; track t.path; let i = $index) {
            <GridLayout [col]="i" class="tab" (tap)="go($event, t.path)">
              @if (t.path === '/profile' && auth.user(); as u) {
                <ns-avatar [avatarId]="u.avatarId" [size]="28" class="tab-avatar" [class.tab-avatar-on]="url() === t.path"></ns-avatar>
              } @else {
                <SVGView [src]="svg(t.icon, url() === t.path)" width="26" height="26" stretch="aspectFit"></SVGView>
              }
              @if (t.path === '/notifications' && unread()) {
                <Label class="tab-dot" horizontalAlignment="center" verticalAlignment="top"></Label>
              }
            </GridLayout>
          }
        </GridLayout>
      }

      <!-- Launch animation: logo holds, then zooms through the screen to reveal the app (like X). -->
      @if (splash()) {
        <GridLayout row="0" rowSpan="2" class="splash" (loaded)="playSplash($event)">
          <StackLayout orientation="horizontal" horizontalAlignment="center" verticalAlignment="center" id="splash-logo" class="splash-logo">
            <Label text="Auge" class="brand splash-brand"></Label>
            <Label text="!" class="brand splash-brand bang"></Label>
          </StackLayout>
        </GridLayout>
      }
    </GridLayout>
  `,
  imports: [PageRouterOutlet, AvatarComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class AppComponent {
  private router = inject(RouterExtensions);
  readonly auth = inject(AuthService);
  private notifications = inject(NotificationsService);
  private theme = inject(ThemeService);
  readonly tabs = TABS;
  readonly splash = signal(true);
  readonly unread = computed(() => this.notifications.unread());
  readonly url = toSignal(
    inject(Router).events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0]),
    ),
    { initialValue: '/feed' },
  );
  /** Tab bar only on the five root screens; detail screens get the full height. */
  readonly showTabs = computed(() => TABS.some((t) => t.path === this.url()));

  constructor() {
    // Start account sync for follows and preferences as soon as the app boots.
    inject(SyncService);
  }

  svg(name: IconName, active: boolean) {
    return icon(name, this.theme.mode() === 'dark' ? '#e7e9ea' : '#0f1419', active);
  }

  async go(e: NsEvent, path: string) {
    const v = viewOf(e);
    v.animate({ scale: { x: 0.85, y: 0.85 }, duration: 80 }).then(() => v.animate({ scale: { x: 1, y: 1 }, duration: 200, curve: CoreTypes.AnimationCurve.spring }));
    if (path === this.url()) return;
    this.router.navigate([path], { clearHistory: true, animated: true, transition: { name: 'fade', duration: 180 } });
  }

  async playSplash(e: NsEvent) {
    const overlay = viewOf(e);
    const logo = overlay.getViewById<View>('splash-logo');
    try {
      // Small breath in, then a big zoom through while the overlay fades.
      await logo.animate({ scale: { x: 0.88, y: 0.88 }, duration: 380, delay: 450, curve: CoreTypes.AnimationCurve.easeInOut });
      await Promise.all([
        logo.animate({ scale: { x: 14, y: 14 }, opacity: 0, duration: 520, curve: CoreTypes.AnimationCurve.cubicBezier(0.7, 0, 0.84, 0) }),
        overlay.animate({ opacity: 0, duration: 420, delay: 160 }),
      ]);
    } finally {
      this.splash.set(false);
    }
  }
}
