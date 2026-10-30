import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { PageRouterOutlet, RouterExtensions } from '@nativescript/angular';
import { CoreTypes, View } from '@nativescript/core';
import { filter, map } from 'rxjs';
import { NsEvent, viewOf } from './core/animate';
import { AuthService } from './core/auth.service';
import { BriefService } from './core/brief.service';
import { AvatarComponent } from './core/avatar.component';
import { IconName, icon } from './core/icons';
import { LayoutService } from './core/layout.service';
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
                <ns-avatar [avatarId]="u.avatarId" [size]="21" class="tab-avatar" horizontalAlignment="center" [class.tab-avatar-on]="url() === t.path"></ns-avatar>
              } @else {
                <SVGView [src]="svg(t.icon, url() === t.path)" width="19" height="19" stretch="aspectFit" horizontalAlignment="center" verticalAlignment="center"></SVGView>
              }
              @if (t.path === '/notifications' && unread()) {
                <Label class="tab-dot" horizontalAlignment="center" verticalAlignment="top"></Label>
              }
            </GridLayout>
          }
        </GridLayout>
      }

      <!-- Mini player (Escuchar Auges / Escuchar auge), floating above the tab bar on every screen. -->
      @if (brief.open()) {
        <GridLayout row="0" rows="auto, auto" class="player" verticalAlignment="bottom" (loaded)="playerIn($event)">
          <GridLayout row="0" [columns]="segments()" class="pl-progress">
            @for (p of brief.parts(); track $index; let i = $index) {
              <StackLayout [col]="i" class="pl-seg" [class.pl-done]="i + 1 < brief.part() || (brief.done() && i + 1 === brief.part())"
                           [class.pl-now]="i + 1 === brief.part() && !brief.isIntro() && !brief.done()" (tap)="brief.seek(i)"></StackLayout>
            }
          </GridLayout>
          <GridLayout row="1" columns="auto, *, auto, auto, auto, auto" class="pl-row">
            <StackLayout col="0" orientation="horizontal" class="pl-wave" verticalAlignment="center">
              @for (b of [0, 1, 2, 3]; track b) {
                <StackLayout class="pl-bar" verticalAlignment="bottom" (loaded)="waveBar($event, b)"></StackLayout>
              }
            </StackLayout>
            <StackLayout col="1" class="pl-info" verticalAlignment="center" (tap)="openPlaying()">
              <Label [text]="brief.kicker() + ' · ' + (brief.isIntro() ? 'intro' : brief.part() + '/' + brief.parts().length)" class="pl-kicker"></Label>
              <Label [text]="brief.title()" class="pl-title"></Label>
            </StackLayout>
            <Label col="2" text="&#xe045;" class="mi pl-btn" (tap)="tapBtn($event); brief.prev()"></Label>
            <Label col="3" [text]="brief.done() ? '&#xe042;' : brief.playing() ? '&#xe034;' : '&#xe037;'" class="mi pl-btn pl-main" (tap)="tapBtn($event); brief.toggle()"></Label>
            <Label col="4" text="&#xe044;" class="mi pl-btn" (tap)="tapBtn($event); brief.next()"></Label>
            <Label col="5" text="&#xe5cd;" class="mi pl-btn pl-x" (tap)="brief.close()"></Label>
          </GridLayout>
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
  readonly brief = inject(BriefService);
  private layout = inject(LayoutService);
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

  /** One column per part of the progress bar. */
  readonly segments = computed(() => this.brief.parts().map(() => '*').join(', ') || '*');

  playerIn(e: NsEvent) {
    const v = viewOf(e);
    v.translateY = 120;
    v.opacity = 0;
    v.animate({ translate: { x: 0, y: 0 }, opacity: 1, duration: 450, curve: CoreTypes.AnimationCurve.cubicBezier(0.16, 1, 0.3, 1) }).catch(() => {});
  }

  /** Equaliser bar: bounces while the voice is speaking, rests low otherwise. */
  async waveBar(e: NsEvent, i: number) {
    const v = viewOf(e);
    v.originY = 1;
    await new Promise((r) => setTimeout(r, i * 140));
    while (v.isLoaded) {
      const talking = this.brief.talking();
      await v.animate({ scale: { x: 1, y: talking ? 0.3 + Math.random() * 0.7 : 0.25 }, duration: talking ? 220 + i * 40 : 400 }).catch(() => {});
    }
  }

  tapBtn(e: NsEvent) {
    const v = viewOf(e);
    v.animate({ scale: { x: 0.85, y: 0.85 }, duration: 80 }).then(() => v.animate({ scale: { x: 1, y: 1 }, duration: 200, curve: CoreTypes.AnimationCurve.spring })).catch(() => {});
  }

  /** Tap on the title: open the story being read. */
  openPlaying() {
    const id = this.brief.ids()[this.brief.index()];
    if (id) this.router.navigate(['/story', id], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }

  async go(e: NsEvent, path: string) {
    const v = viewOf(e);
    v.animate({ scale: { x: 0.85, y: 0.85 }, duration: 80 }).then(() => v.animate({ scale: { x: 1, y: 1 }, duration: 200, curve: CoreTypes.AnimationCurve.spring }));
    // Tapping the tab you are on scrolls it back to the top, smoothly (like X).
    if (path === this.url()) return this.layout.scrollTopTick.update((n) => n + 1);
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
