import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs, Page } from '@nativescript/core';
import { AuthService, Provider } from '../core/auth.service';
import { bang, NsEvent, press, rise, viewOf } from '../core/animate';

/** Sign in with Google or Apple. */
@Component({
  selector: 'ns-login',
  templateUrl: './login.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class LoginComponent {
  private router = inject(RouterExtensions);
  readonly auth = inject(AuthService);
  readonly busy = signal(false);

  constructor() {
    inject(Page).actionBarHidden = true;
  }

  close() {
    this.router.back();
  }

  async provider(e: NsEvent, p: Provider) {
    await press(viewOf(e));
    await this.run(() => this.auth.signInWith(p));
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    try {
      await fn();
      if (this.auth.signedIn()) {
        // First login: pick avatar, name and @username before anything else.
        if (this.auth.needsSetup()) this.router.navigate(['/profile/edit'], { clearHistory: false, transition: { name: 'slideLeft' } });
        else this.router.back();
      }
    } catch (err) {
      Dialogs.alert({ title: 'No se pudo entrar', message: (err as Error).message, okButtonText: 'Vale' });
    } finally {
      this.busy.set(false);
    }
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }

  bang(e: NsEvent) {
    bang(viewOf(e));
  }
}
