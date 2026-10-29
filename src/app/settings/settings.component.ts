import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import { NsEvent, rise, viewOf } from '../core/animate';
import { CATEGORIES } from '../core/categories';
import { NotificationsService } from '../core/notifications.service';
import { Prefs, PrefsService } from '../core/prefs.service';
import { StoriesService } from '../core/stories.service';
import { ThemeService } from '../core/theme.service';

type Toggle = keyof Pick<Prefs, 'notifyFollowed' | 'notifyBreaking' | 'notifyDigest' | 'quietHours'>;

@Component({
  selector: 'ns-settings',
  templateUrl: './settings.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsComponent {
  private router = inject(RouterExtensions);
  private service = inject(PrefsService);
  private stories = inject(StoriesService);
  private notifications = inject(NotificationsService);
  readonly theme = inject(ThemeService);
  readonly prefs = this.service.prefs;
  readonly categories = CATEGORIES;
  readonly toggles: { key: Toggle; label: string; hint: string }[] = [
    { key: 'notifyFollowed', label: 'Auges que sigo', hint: 'Cuando algo cambie o se confirme.' },
    { key: 'notifyBreaking', label: 'Última hora', hint: 'Solo lo más importante del mundo.' },
    { key: 'notifyDigest', label: 'Resumen diario', hint: 'Cada mañana, el mundo en 30 segundos.' },
    { key: 'quietHours', label: 'No molestar de noche', hint: 'Sin avisos de 23:00 a 08:00.' },
  ];

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  back() {
    this.router.back();
  }

  async toggle(key: Toggle) {
    const on = !this.prefs()[key];
    if (on && key !== 'quietHours') await this.notifications.requestPermission();
    this.service.set(key, on);
  }

  toggleCategory(id: (typeof CATEGORIES)[number]['id']) {
    this.service.toggleCategory(id);
  }

  async test() {
    await this.notifications.requestPermission();
    const top = this.stories.stories()[0];
    this.notifications.push(`Auge! · #${top.tag}`, top.brief, top.id);
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }
}
