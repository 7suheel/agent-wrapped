import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface CardFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600 | 700 | 800;
  style: 'normal';
}

const FILES: [name: string, file: string, weight: CardFont['weight']][] = [
  ['Inter', 'inter-latin-400-normal.woff', 400],
  ['Inter', 'inter-latin-600-normal.woff', 600],
  ['Inter', 'inter-latin-700-normal.woff', 700],
  ['Bricolage', 'bricolage-grotesque-latin-500-normal.woff', 500],
  ['Bricolage', 'bricolage-grotesque-latin-800-normal.woff', 800],
  ['JetBrains Mono', 'jetbrains-mono-latin-500-normal.woff', 500],
];

let cache: CardFont[] | undefined;

/** Fonts ship inside the package (SIL OFL), so cards render offline. */
export function loadFonts(): CardFont[] {
  cache ??= FILES.map(([name, file, weight]) => ({
    name,
    weight,
    style: 'normal' as const,
    data: readFileSync(fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url))),
  }));
  return cache;
}
