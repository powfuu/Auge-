import { CoreTypes, EventData, View } from '@nativescript/core';

const ease = CoreTypes.AnimationCurve.cubicBezier(0.16, 1, 0.3, 1);

/** Fade + rise in, used for staggered entrances. */
export function rise(view: View, delay = 0) {
  view.opacity = 0;
  view.translateY = 24;
  view.animate({ opacity: 1, translate: { x: 0, y: 0 }, duration: 600, delay, curve: ease }).catch(() => {});
}

/** Quick press feedback. */
export async function press(view: View) {
  await view.animate({ scale: { x: 0.97, y: 0.97 }, duration: 90 });
  await view.animate({ scale: { x: 1, y: 1 }, duration: 260, curve: ease });
}

/** Endless soft ping for the live dot. */
export function pulse(view: View) {
  const loop = () => {
    if (!view.isLoaded) return;
    view.scaleX = view.scaleY = 1;
    view.opacity = 0.6;
    view
      .animate({ scale: { x: 2.2, y: 2.2 }, opacity: 0, duration: 1400, curve: CoreTypes.AnimationCurve.easeOut })
      .then(loop)
      .catch(() => {});
  };
  loop();
}

/** Brand "!" drops in with a springy overshoot, then sways gently forever. */
export async function bang(view: View) {
  view.originY = 1;
  view.opacity = 0;
  view.translateY = -40;
  view.rotate = -20;
  try {
    await view.animate({ opacity: 1, translate: { x: 0, y: 0 }, rotate: 0, duration: 700, delay: 250, curve: CoreTypes.AnimationCurve.spring });
    while (view.isLoaded) {
      await view.animate({ rotate: 8, duration: 900, curve: CoreTypes.AnimationCurve.easeInOut });
      await view.animate({ rotate: 0, duration: 900, curve: CoreTypes.AnimationCurve.easeInOut });
      await view.animate({ rotate: 0, duration: 2400 });
    }
  } catch {}
}

/** Grows a bar from the left edge to its full width. */
export function grow(view: View, delay = 0) {
  view.originX = 0;
  view.scaleX = 0;
  view.animate({ scale: { x: 1, y: 1 }, duration: 900, delay, curve: ease }).catch(() => {});
}

/** Template events are typed as DOM `Event`; in NativeScript they carry the view in `object`. */
export type NsEvent = Event | EventData;
export const viewOf = (e: NsEvent) => (e as EventData).object as View;
