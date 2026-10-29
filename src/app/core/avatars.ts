/**
 * Free profile picture collection: cute characters on Auge-style backgrounds
 * (brand red→orange, ink black, paper white). Rendered natively, no image files.
 */
export interface Avatar {
  id: string;
  face: string;
  /** CSS gradient start/end colors */
  from: string;
  to: string;
  name: string;
}

export const AVATARS: Avatar[] = [
  { id: 'fox', face: '🦊', from: '#ff3b30', to: '#ff9500', name: 'Zorro' },
  { id: 'cat', face: '🐱', from: '#0a0a0a', to: '#3a3a3a', name: 'Gato' },
  { id: 'panda', face: '🐼', from: '#ffffff', to: '#e5e5e5', name: 'Panda' },
  { id: 'octopus', face: '🐙', from: '#ff9500', to: '#ffcc00', name: 'Pulpo' },
  { id: 'frog', face: '🐸', from: '#16a34a', to: '#86efac', name: 'Rana' },
  { id: 'penguin', face: '🐧', from: '#1f2937', to: '#ff3b30', name: 'Pingüino' },
  { id: 'owl', face: '🦉', from: '#7c2d12', to: '#ff9500', name: 'Búho' },
  { id: 'koala', face: '🐨', from: '#e5e5e5', to: '#a3a3a3', name: 'Koala' },
  { id: 'tiger', face: '🐯', from: '#ff3b30', to: '#0a0a0a', name: 'Tigre' },
  { id: 'bunny', face: '🐰', from: '#fecaca', to: '#ff3b30', name: 'Conejo' },
  { id: 'bear', face: '🐻', from: '#78350f', to: '#d97706', name: 'Oso' },
  { id: 'unicorn', face: '🦄', from: '#f0abfc', to: '#ff9500', name: 'Unicornio' },
  { id: 'whale', face: '🐳', from: '#0ea5e9', to: '#0a0a0a', name: 'Ballena' },
  { id: 'chick', face: '🐥', from: '#fde047', to: '#ff9500', name: 'Pollito' },
  { id: 'alien', face: '👽', from: '#0a0a0a', to: '#16a34a', name: 'Alien' },
  { id: 'robot', face: '🤖', from: '#a3a3a3', to: '#ff3b30', name: 'Robot' },
];

export const avatarById = (id?: string | null) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];
export const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
