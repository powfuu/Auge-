import { ApplicationSettings, Utils } from '@nativescript/core';
import { Story } from './models';

declare const com: { auge: { app: { AugeWidget: { refresh(ctx: unknown): void } } } };

/** Pushes the top auges to the Android home screen widget (see App_Resources/Android/.../AugeWidget.java). */
export function updateWidget(stories: Story[]) {
  if (!__ANDROID__) return;
  ApplicationSettings.setString('widget', stories.slice(0, 3).map((s, i) => `${i + 1}  #${s.tag}`).join('\n'));
  try {
    com.auge.app.AugeWidget.refresh(Utils.android.getApplicationContext());
  } catch {
    // Widget class missing in this build; nothing to refresh.
  }
}
