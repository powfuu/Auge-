import { Injectable, signal } from '@angular/core';
import { Application, ApplicationSettings } from '@nativescript/core';

type Mode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<Mode>((ApplicationSettings.getString('theme') as Mode) || Application.systemAppearance() || 'light');

  /** Pushes the current mode to the root view so `.ns-dark` CSS applies. */
  apply() {
    const root = Application.getRootView();
    if (!root) return;
    Application.setAutoSystemAppearanceChanged(false);
    Application.systemAppearanceChanged(root, this.mode());
  }

  toggle() {
    this.mode.set(this.mode() === 'dark' ? 'light' : 'dark');
    ApplicationSettings.setString('theme', this.mode());
    this.apply();
  }
}
