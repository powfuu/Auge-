import { Component, NO_ERRORS_SCHEMA, computed, inject, input } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { shareImage, shareText } from '@nativescript/social-share';
import { CoreTypes, Dialogs, Utils, View } from '@nativescript/core';
import { icon } from '../core/icons';
import { ThemeService } from '../core/theme.service';
import { followPop, grow, heartbeat, press, rise, NsEvent, viewOf } from '../core/animate';
import { BriefService } from '../core/brief.service';
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
  private theme = inject(ThemeService);
  private brief = inject(BriefService);
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
    await followPop(viewOf(e), this.following());
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

  /** The Auge button hides while this very story is playing. */
  readonly listening = computed(() => this.brief.playing() && this.brief.kicker() === 'Escuchar auge' && this.brief.ids()[0] === this.storyId());

  /** Escuchar Auge: a beat on tap, then read this story. */
  async listenTap(e: NsEvent) {
    this.listen();
    await heartbeat(viewOf(e), true);
  }

  /** Escuchar auge: read this whole story in the mini player. */
  listen() {
    this.brief.playStory(this.story());
  }

  /** Same bookmark as the feed; filled red when following. */
  followSvg() {
    const on = this.following();
    const ink = this.theme.mode() === 'dark' ? '#0a0a0a' : '#ffffff'; // pill is inverted when not following
    return icon('following', on ? '#ff3b30' : ink, on);
  }

  shareSvg() {
    const c = this.theme.mode() === 'dark' ? '#e7e9ea' : '#0f1419';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>`;
  }

  /** We link out to the conversation; the networks (web or installed app via universal links) host it. */
  async openTag(hashtag: string) {
    const tag = hashtag.replace(/^#/, '');
    const lower = encodeURIComponent(tag.toLowerCase());
    const nets: Record<string, string> = {
      X: `https://x.com/hashtag/${encodeURIComponent(tag)}`,
      Instagram: `https://www.instagram.com/explore/tags/${lower}/`,
      TikTok: `https://www.tiktok.com/tag/${lower}`,
      Facebook: `https://www.facebook.com/hashtag/${lower}`,
    };
    const choice = await Dialogs.action({ title: `#${tag}`, message: 'Ver la conversación en', cancelButtonText: 'Cancelar', actions: Object.keys(nets) });
    if (nets[choice]) Utils.openUrl(nets[choice]);
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

  /** Cover photo settles from a slight zoom, like the web preview. */
  heroIn(e: NsEvent) {
    const v = viewOf(e);
    v.scaleX = v.scaleY = 1.06;
    v.animate({ scale: { x: 1, y: 1 }, duration: 1200, curve: CoreTypes.AnimationCurve.easeOut }).catch(() => {});
  }

  grow(e: NsEvent, delay: number) {
    grow(viewOf(e), delay);
  }
}
