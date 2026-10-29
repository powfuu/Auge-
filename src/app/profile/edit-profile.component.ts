import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import { NsEvent, press, rise, viewOf } from '../core/animate';
import { AuthService, USERNAME_RE } from '../core/auth.service';
import { AvatarComponent } from '../core/avatar.component';
import { AVATARS } from '../core/avatars';

/** Pick a profile picture from the collection, a full name and a unique @username. Also the first-login setup. */
@Component({
  selector: 'ns-edit-profile',
  templateUrl: './edit-profile.component.html',
  imports: [AvatarComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class EditProfileComponent {
  private router = inject(RouterExtensions);
  private auth = inject(AuthService);
  readonly avatars = AVATARS;
  readonly setup = this.auth.needsSetup();
  readonly avatarId = signal(this.auth.user()?.avatarId ?? AVATARS[0].id);
  readonly fullName = signal(this.auth.user()?.fullName ?? '');
  readonly username = signal(this.auth.user()?.username ?? '');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly valid = computed(() => this.fullName().trim().length > 0 && USERNAME_RE.test(this.username()));

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  close() {
    this.router.back();
  }

  async pick(e: NsEvent, id: string) {
    this.avatarId.set(id);
    await press(viewOf(e));
  }

  setUsername(value: string) {
    this.username.set(value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_.]/g, ''));
    this.error.set('');
  }

  async save() {
    if (!this.valid()) {
      return this.error.set(!this.fullName().trim() ? 'Escribe tu nombre.' : 'El @usuario debe tener 3–20 letras, números, _ o .');
    }
    this.busy.set(true);
    try {
      if (!(await this.auth.isUsernameFree(this.username()))) return this.error.set('Ese @usuario ya está cogido.');
      await this.auth.updateProfile({ fullName: this.fullName().trim(), username: this.username(), avatarId: this.avatarId() });
      this.router.back();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }
}
