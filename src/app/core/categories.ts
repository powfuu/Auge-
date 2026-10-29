import { Category } from './models';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'politica', label: 'Política' },
  { id: 'conflictos', label: 'Conflictos' },
  { id: 'economia', label: 'Economía' },
  { id: 'sucesos', label: 'Sucesos' },
  { id: 'sociedad', label: 'Sociedad' },
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'deportes', label: 'Deportes' },
];

export const categoryLabel = (id: Category) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
