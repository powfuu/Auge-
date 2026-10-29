/**
 * Thin outline icons in the style of X's tab bar: 1.75 stroke when idle, filled (or bolder) when active.
 * Paths adapted from Lucide (ISC license). Returned as SVG strings for SVGView.
 */
export type IconName = 'auge' | 'explore' | 'following' | 'alerts' | 'person';

const PATHS: Record<IconName, { d: string[]; fillable: boolean }> = {
  auge: {
    d: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
    fillable: true,
  },
  explore: { d: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'm21 21-4.3-4.3'], fillable: false },
  following: { d: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z'], fillable: true },
  alerts: { d: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'], fillable: true },
  person: { d: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], fillable: true },
};

export function icon(name: IconName, color: string, active = false): string {
  const { d, fillable } = PATHS[name];
  const fill = active && fillable ? color : 'none';
  const width = active && !fillable ? 2.6 : 1.75;
  const paths = d.map((p, i) => `<path d="${p}" fill="${i === 0 ? fill : 'none'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
