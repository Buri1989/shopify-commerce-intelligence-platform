export function graphql(
  strings: TemplateStringsArray,
  ...fragments: string[]
): string {
  return String.raw({ raw: strings }, ...fragments)
    .replace(/\s+/g, ' ')
    .trim();
}
