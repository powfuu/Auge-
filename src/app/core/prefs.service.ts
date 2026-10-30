import { Injectable, effect, signal } from '@angular/core';
import { ApplicationSettings } from '@nativescript/core';
import { Edition } from './editions';
import { Category } from './models';

export interface Prefs {
  /** Categories the user cares about; empty means "everything". */
  categories: Category[];
  notifyFollowed: boolean;
  notifyBreaking: boolean;
  notifyDigest: boolean;
  /** Silence pushes 23:00–08:00. */
  quietHours: boolean;
  /** News edition chosen by the user; null follows the device language. */
  edition: Edition | null;
}

const KEY = 'prefs';
const DEFAULTS: Prefs = { categories: [], notifyFollowed: true, notifyBreaking: true, notifyDigest: false, quietHours: true, edition: null };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(ApplicationSettings.getString(KEY, '{}')) };
  } catch {
    return DEFAULTS;
  }
}

@Injectable({ providedIn: 'root' })
export class PrefsService {
  readonly prefs = signal<Prefs>(load());

  constructor() {
    effect(() => ApplicationSettings.setString(KEY, JSON.stringify(this.prefs())));
  }

  set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    this.prefs.update((p) => ({ ...p, [key]: value }));
  }

  toggleCategory(id: Category) {
    const cats = this.prefs().categories;
    this.set('categories', cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id]);
  }
}
