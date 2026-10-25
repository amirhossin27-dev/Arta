export interface Names {
  me: string;
  partner: string;
}

/** Ersetzt {me} und {partner} in einem Text. */
export function fill(template: string, names: Names): string {
  return template.replace(/\{me\}/g, names.me).replace(/\{partner\}/g, names.partner);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
