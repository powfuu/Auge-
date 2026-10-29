import { ImageSource, View } from '@nativescript/core';

/** Renders a laid-out view into an image, used for the shareable auge card. */
export function snapshot(view: View): ImageSource | null {
  if (__ANDROID__) {
    const nv = view.android as android.view.View;
    if (!nv || !nv.getWidth()) return null;
    const bitmap = android.graphics.Bitmap.createBitmap(nv.getWidth(), nv.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
    nv.draw(new android.graphics.Canvas(bitmap));
    return new ImageSource(bitmap);
  }
  if (__IOS__) {
    const nv = view.ios as UIView;
    if (!nv) return null;
    const renderer = UIGraphicsImageRenderer.alloc().initWithBounds(nv.bounds);
    const image = renderer.imageWithActions((ctx) => nv.layer.renderInContext(ctx.CGContext));
    return new ImageSource(image);
  }
  return null;
}
