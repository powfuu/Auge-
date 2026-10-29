import './polyfills';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication, provideNativeScriptRouter, registerElement, runNativeScriptAngularApp } from '@nativescript/angular';
import { PullToRefresh } from '@nativescript-community/ui-pulltorefresh';
import { SVGView } from '@nativescript-community/ui-svg';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

registerElement('PullToRefresh', () => PullToRefresh);
registerElement('SVGView', () => SVGView);

runNativeScriptAngularApp({
  appModuleBootstrap: () =>
    bootstrapApplication(AppComponent, {
      providers: [provideZonelessChangeDetection(), provideNativeScriptRouter(routes)],
    }),
});
