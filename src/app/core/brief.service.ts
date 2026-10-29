import { Injectable, inject, signal } from '@angular/core';
import { TNSTextToSpeech } from '@nativescript-community/texttospeech';
import { StoriesService } from './stories.service';

/** "El mundo en 60 segundos": reads the top auges aloud with the device voice. */
@Injectable({ providedIn: 'root' })
export class BriefService {
  private stories = inject(StoriesService);
  private tts = new TNSTextToSpeech();
  readonly playing = signal(false);

  script() {
    const list = this.stories.top();
    const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return [
      `Esto es Auge. ${date}. Lo que está en auge en el mundo.`,
      ...list.map((s, i) => `${i + 1}. ${s.tag}. ${s.brief}`),
      'Estás al día.',
    ].join(' ');
  }

  async toggle() {
    if (this.playing()) {
      this.tts.pause();
      this.playing.set(false);
      return;
    }
    this.playing.set(true);
    await this.tts.speak({
      text: this.script(),
      locale: 'es-ES',
      speakRate: 0.55,
      finishedCallback: () => this.playing.set(false),
    });
  }
}
