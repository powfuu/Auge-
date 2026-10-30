import { Injectable, computed, inject, signal } from '@angular/core';
import { TNSTextToSpeech } from '@nativescript-community/texttospeech';
import { Edition } from './editions';
import { Story } from './models';
import { StoriesService } from './stories.service';

/** Voice locale and intro per edition. */
const BRIEF: Record<Edition, { locale: string; intro: string }> = {
  es: { locale: 'es-ES', intro: 'Ahora mismo en Auge:' },
  en: { locale: 'en-US', intro: 'Right now on Auge:' },
  de: { locale: 'de-DE', intro: 'Gerade auf Auge:' },
  fr: { locale: 'fr-FR', intro: 'En ce moment sur Auge :' },
  pt: { locale: 'pt-BR', intro: 'Agora mesmo no Auge:' },
  it: { locale: 'it-IT', intro: 'In questo momento su Auge:' },
  ja: { locale: 'ja-JP', intro: '今、Augeで話題のニュース。' },
  zh: { locale: 'zh-CN', intro: 'Auge 此刻热点：' },
  ko: { locale: 'ko-KR', intro: '지금 Auge에서는:' },
};

type Spoken = { report: string; timeline: string; confirmed: string; developing: string; uncertain: string; ago: (n: number, unit: 'h' | 'm') => string };
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Spoken section labels per edition, so a story sounds like it reads on screen. */
const SPOKEN: Record<Edition, Spoken> = {
  es: { report: 'El informe.', confirmed: 'Confirmado', developing: 'En desarrollo', uncertain: 'Incierto', timeline: 'Cronología.', ago: (n, u) => `Hace ${n} ${u === 'h' ? plural(n, 'hora', 'horas') : plural(n, 'minuto', 'minutos')}` },
  en: { report: 'The report.', confirmed: 'Confirmed', developing: 'Developing', uncertain: 'Unconfirmed', timeline: 'Timeline.', ago: (n, u) => `${n} ${u === 'h' ? plural(n, 'hour', 'hours') : plural(n, 'minute', 'minutes')} ago` },
  de: { report: 'Der Bericht.', confirmed: 'Bestätigt', developing: 'In Entwicklung', uncertain: 'Unbestätigt', timeline: 'Chronologie.', ago: (n, u) => `Vor ${n} ${u === 'h' ? plural(n, 'Stunde', 'Stunden') : plural(n, 'Minute', 'Minuten')}` },
  fr: { report: 'Le rapport.', confirmed: 'Confirmé', developing: 'En cours', uncertain: 'Non confirmé', timeline: 'Chronologie.', ago: (n, u) => `Il y a ${n} ${u === 'h' ? plural(n, 'heure', 'heures') : plural(n, 'minute', 'minutes')}` },
  pt: { report: 'O relatório.', confirmed: 'Confirmado', developing: 'Em desenvolvimento', uncertain: 'Incerto', timeline: 'Cronologia.', ago: (n, u) => `Há ${n} ${u === 'h' ? plural(n, 'hora', 'horas') : plural(n, 'minuto', 'minutos')}` },
  it: { report: 'Il rapporto.', confirmed: 'Confermato', developing: 'In sviluppo', uncertain: 'Incerto', timeline: 'Cronologia.', ago: (n, u) => `${n} ${u === 'h' ? plural(n, 'ora', 'ore') : plural(n, 'minuto', 'minuti')} fa` },
  ja: { report: 'レポート。', confirmed: '確認済み', developing: '進行中', uncertain: '未確認', timeline: '経過。', ago: (n, u) => `${n}${u === 'h' ? '時間' : '分'}前` },
  zh: { report: '报道。', confirmed: '已确认', developing: '进展中', uncertain: '未证实', timeline: '时间线。', ago: (n, u) => `${n}${u === 'h' ? '小时' : '分钟'}前` },
  ko: { report: '리포트.', confirmed: '확인됨', developing: '진행 중', uncertain: '미확인', timeline: '경과.', ago: (n, u) => `${n}${u === 'h' ? '시간' : '분'} 전` },
};

const spokenAgo = (d: Date, L: Spoken) => {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 60 ? L.ago(m, 'm') : L.ago(Math.round(m / 60), 'h');
};

/**
 * Audio player behind the floating mini player.
 * "Escuchar Auges" queues the intro + every headline; "Escuchar auge" queues one story in full.
 * Each line is spoken on its own so we can pause, skip and seek between them.
 */
@Injectable({ providedIn: 'root' })
export class BriefService {
  private stories = inject(StoriesService);
  private tts = new TNSTextToSpeech();
  private token = 0;

  readonly queue = signal<string[]>([]);
  readonly ids = signal<(string | null)[]>([]);
  readonly index = signal(0);
  readonly playing = signal(false);
  readonly talking = signal(false);
  readonly open = signal(false);
  readonly done = signal(false);
  readonly kicker = signal('');
  readonly hasIntro = signal(true);

  /** Parts shown in the progress bar (the intro isn't one). */
  readonly parts = computed(() => this.queue().slice(this.hasIntro() ? 1 : 0));
  readonly part = computed(() => Math.max(1, this.index() + (this.hasIntro() ? 0 : 1)));
  readonly isIntro = computed(() => this.hasIntro() && this.index() === 0);
  readonly title = computed(() => {
    const line = this.queue()[this.index()] ?? '';
    return this.isIntro() || !this.hasIntro() ? line : '#' + line;
  });

  /** Escuchar Auges: intro + headlines of the feed. */
  playHeadlines() {
    const list = this.stories.top();
    this.queue.set([BRIEF[this.stories.edition()].intro, ...list.map((s) => s.tag.replace(/^#/, ''))]);
    this.ids.set([null, ...list.map((s) => s.id)]);
    this.kicker.set('Escuchar Auges');
    this.hasIntro.set(true);
    this.open.set(true);
    this.playAt(0);
  }

  /** Escuchar auge: the open story as it reads on screen — report with certainty, then the timeline. */
  playStory(s: Story) {
    const L = SPOKEN[this.stories.edition()];
    const lines = [
      s.tag.replace(/^#/, ''),
      s.brief,
      ...s.facts.map((f, i) => `${i === 0 ? L.report + ' ' : ''}${L[f.certainty]}: ${f.text}`),
      ...s.timeline.map((t, i) => `${i === 0 ? L.timeline + ' ' : ''}${spokenAgo(t.at, L)}: ${t.text}`),
    ].filter(
      (x, i, all) => x && all.indexOf(x) === i,
    );
    this.queue.set(lines);
    this.ids.set(lines.map(() => s.id));
    this.kicker.set('Escuchar auge');
    this.hasIntro.set(false);
    this.open.set(true);
    this.playAt(0);
  }

  playAt(i: number) {
    const token = ++this.token;
    this.tts.pause();
    if (i >= this.queue().length) {
      this.playing.set(false);
      this.talking.set(false);
      this.done.set(true);
      return;
    }
    this.index.set(Math.max(0, i));
    this.playing.set(true);
    this.done.set(false);
    this.talking.set(true);
    this.tts.speak({
      text: this.queue()[this.index()],
      locale: BRIEF[this.stories.edition()].locale,
      speakRate: 0.5,
      pitch: 1,
      finishedCallback: () => {
        if (token !== this.token) return;
        this.talking.set(false);
        if (this.playing()) this.playAt(this.index() + 1);
      },
    });
  }

  toggle() {
    if (this.done()) return this.playAt(0);
    if (this.playing()) return this.pause();
    this.playAt(this.index());
  }

  pause() {
    this.token++;
    this.tts.pause();
    this.playing.set(false);
    this.talking.set(false);
  }

  prev() {
    this.playAt(Math.max(this.index() - 1, 0));
  }

  next() {
    this.playAt(this.index() + 1);
  }

  /** Seek to a part of the progress bar. */
  seek(part: number) {
    this.playAt(part + (this.hasIntro() ? 1 : 0));
  }

  close() {
    this.pause();
    this.open.set(false);
  }
}
