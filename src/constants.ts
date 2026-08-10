/**
 * Supported languages, split by host family.
 *
 * The two families need different handling in several providers:
 *
 * - HTML-family languages accept Alpine's `@event` / `:attr` shorthands as
 *   attribute names, and "am I inside a tag?" is answered by the tolerant
 *   markup scan in htmlContext.ts.
 *
 * - JSX-family languages do not. `@click="…"` and `:class="…"` are outright
 *   syntax errors in TSX (TS1003 "Identifier expected" / TS1382 "Unexpected
 *   token"), so the shorthand code paths are skipped entirely there rather
 *   than heuristically guarded. The long forms `x-on:click` and `x-bind:class`
 *   are valid JSX namespaced attribute names and type-check cleanly, as do
 *   hyphenated names like `x-data` and bare boolean ones like `x-cloak`.
 *   The angle-bracket scan is also meaningless in a language where `<` is a
 *   comparison operator and a generic-argument delimiter, so JSX uses the
 *   structural scanner in jsxContext.ts instead.
 */

/**
 * Languages whose documents are HTML markup (possibly with a template layer).
 *
 * `astro` belongs here rather than with JSX: an `.astro` template is markup,
 * `@click` and `:class` are ordinary attribute names in it, and its own
 * `client:load` / `set:html` directives are already safe from the `:`
 * shorthand check for the same reason `wire:model` is. Its TypeScript
 * frontmatter is the one part that isn't markup, and the tag scan skips it
 * (see `frontmatterEnd` in htmlContext.ts).
 */
export const HTML_LANGUAGES = [
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade', 'liquid', 'jinja-html',
	'astro',
] as const;

/**
 * Languages whose documents are JavaScript/TypeScript that may contain JSX.
 *
 * `javascript` is included because it is the language ID for `.js`, `.mjs`
 * and `.cjs`, and plenty of projects put JSX in `.js` files — only `.jsx`
 * gets `javascriptreact`. Everything the providers do in these languages is
 * gated on being structurally inside a JSX tag, so a `.js` file with no JSX
 * in it sees nothing.
 */
export const JSX_LANGUAGES = [
	'javascript', 'javascriptreact', 'typescriptreact',
] as const;

/** Every language this extension registers providers for. */
export const ALPINE_LANGUAGES = [
	...HTML_LANGUAGES, ...JSX_LANGUAGES,
] as const;

export type AlpineLanguage = typeof ALPINE_LANGUAGES[number];

export const ALPINE_LANGUAGES_SET = new Set<string>(ALPINE_LANGUAGES);
export const HTML_LANGUAGES_SET = new Set<string>(HTML_LANGUAGES);
export const JSX_LANGUAGES_SET = new Set<string>(JSX_LANGUAGES);

/** True when `languageId` is a JSX-family language (`.jsx` / `.tsx`). */
export function isJsxLanguage(languageId: string): boolean {
	return JSX_LANGUAGES_SET.has(languageId);
}
