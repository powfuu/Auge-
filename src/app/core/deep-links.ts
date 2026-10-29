import { AndroidActivityNewIntentEventData, Application } from '@nativescript/core';

/** Calls `handler` with auge:// URLs the app is opened with (the Supabase OAuth callback). */
export function onDeepLink(handler: (url: string) => void) {
  if (__ANDROID__) {
    const read = (intent: android.content.Intent | undefined) => {
      const data = intent?.getData();
      if (data && data.getScheme() === 'auge') handler(data.toString());
    };
    Application.android.on(Application.android.activityNewIntentEvent, (e: AndroidActivityNewIntentEventData) => read(e.intent));
    Application.android.on(Application.android.activityCreatedEvent, () => read(Application.android.foregroundActivity?.getIntent()));
  }
  if (__IOS__) {
    Application.ios.addDelegateHandler('applicationOpenURLOptions', (_app: UIApplication, url: NSURL) => {
      if (url.scheme === 'auge' && url.absoluteString) handler(url.absoluteString);
      return true;
    });
  }
}
