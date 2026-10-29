import { Component, NO_ERRORS_SCHEMA, computed, inject, input } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { shareImage, shareText } from '@nativescript/social-share';
import { Utils, View } from '@nativescript/core';
import { grow, press, rise, NsEvent, viewOf } from '../core/animate';
import { categoryLabel } from '../core/categories';
import { Certainty, Claim, Source } from '../core/models';
import { snapshot } from '../core/snapshot';
import { StoriesService, timeAgo } from '../core/stories.service';

const VERDICTS: Record<Claim['verdict'], string> = {
  contradicted: 'Falso',
  unproven: 'Sin pruebas',
  consistent: 'Coincide',
};

const LABELS: Record<Certainty, string> = {
  confirmed: 'Confirmado',
  developing: 'En desarrollo',
  uncertain: 'Incierto',
};

/** Full auge report. Used as its own page on phones and as the right pane on wide screens. */
@Component({
  selector: 'ns-story-view',
  templateUrl: './story-view.component.html',
  schemas: [NO_ERRORS_SCHEMA],
})
export class StoryViewComponent {
  private router = inject(RouterExtensions);
  private service = inject(StoriesService);
  readonly storyId = input.required<string>();
  readonly showBack = input(true);
  readonly story = computed(() => this.service.byId(this.storyId())!);
  readonly following = computed(() => this.service.followed().has(this.storyId()));
  readonly labels = LABELS;
  readonly verdicts = VERDICTS;
  readonly today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  readonly certaintySummary = computed(() => {
    const f = this.story().facts;
    const n = (c: Certainty) => f.filter((x) => x.certainty === c).length;
    return `${n('confirmed')} confirmado · ${n('developing')} en desarrollo · ${n('uncertain')} incierto`;
  });
  readonly timeAgo = timeAgo;
  readonly categoryLabel = categoryLabel;

  back() {
    this.router.back();
  }

  async follow(e: NsEvent) {
    this.service.toggleFollow(this.storyId());
    await press(viewOf(e));
  }

  /** Shares the branded card as an image (for Stories, X, WhatsApp); falls back to text. */
  share(card: View | HTMLElement) {
    const s = this.story();
    const text = `#${s.tag} — ${s.brief}

Visto en Auge! · ${s.sources[0]?.url ?? ''}`;
    const image = snapshot(card as View);
    if (image) shareImage(image, { caption: text, subject: 'Compartir auge' });
    else shareText(text, 'Compartir auge');
  }

  openMedia(index: number) {
    this.router.navigate(['/media', this.storyId(), index], { transition: { name: 'fade', duration: 250 } });
  }

  openSource(s: Source) {
    Utils.openUrl(s.url);
  }

  rise(e: NsEvent, delay: number) {
    rise(viewOf(e), delay);
  }

  grow(e: NsEvent, delay: number) {
    grow(viewOf(e), delay);
  }
}
