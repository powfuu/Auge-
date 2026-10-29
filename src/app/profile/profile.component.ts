import { Component, NO_ERRORS_SCHEMA, computed, inject } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs, Page } from '@nativescript/core';
import { NsEvent, rise, viewOf } from '../core/animate';
import { AuthService } from '../core/auth.service';
import { AvatarComponent } from '../core/avatar.component';
import { categoryLabel } from '../core/categories';
import { NotificationsService } from '../core/notifications.service';
import { PrefsService } from '../core/prefs.service';
import { StoriesService } from '../core/stories.service';

const PROVIDERS: Record<string, string> = { google: 'Google', apple: 'Apple' };

@Component({
  selector: 'ns-profile',
  templateUrl: './profile.component.html',
  imports: [AvatarComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class ProfileComponent {
  private router = inject(RouterExtensions);
  readonly auth = inject(AuthService);
  private stories = inject(StoriesService);
  private prefs = inject(PrefsService);
  private notifications = inject(NotificationsService);
  readonly providers = PROVIDERS;

  readonly stats = computed(() => [
    { value: this.stories.followed().size, label: 'Siguiendo' },
    { value: this.prefs.prefs().categories.length || 'Todos', label: 'Temas' },
    { value: this.notifications.inbox().length, label: 'Avisos' },
  ]);
  readonly topics = computed(() => this.prefs.prefs().categories.map(categoryLabel));
  readonly since = computed(() =>
    this.auth.user()?.since.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) ?? '',
  );

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  back() {
    this.router.back();
  }

  go(path: string) {
    this.router.navigate([path], { transition: { name: 'slide', duration: 320, curve: 'easeOut' } });
  }

  async signOut() {
    const ok = await Dialogs.confirm({ title: 'Cerrar sesión', message: '¿Seguro?', okButtonText: 'Cerrar sesión', cancelButtonText: 'Cancelar' });
    if (ok) await this.auth.signOut();
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }
}
