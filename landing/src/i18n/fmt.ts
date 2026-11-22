/** Replaces {n} in a translated string. Dictionaries hold plain strings so they can reach client components. */
export function fmt(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}
