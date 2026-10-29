import { Component, NO_ERRORS_SCHEMA, computed, input } from '@angular/core';
import { avatarById } from './avatars';

/** Round profile picture from the Auge avatar collection. */
@Component({
  selector: 'ns-avatar',
  template: `
    <GridLayout [width]="size()" [height]="size()" [borderRadius]="size() / 2" [background]="bg()" class="avatar-circle">
      <Label [text]="avatar().face" [fontSize]="size() * 0.52" class="avatar-face"></Label>
    </GridLayout>
  `,
  schemas: [NO_ERRORS_SCHEMA],
})
export class AvatarComponent {
  readonly avatarId = input<string | null | undefined>(null);
  readonly size = input(72);
  readonly avatar = computed(() => avatarById(this.avatarId()));
  readonly bg = computed(() => `linear-gradient(135deg, ${this.avatar().from}, ${this.avatar().to})`);
}
