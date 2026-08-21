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
	'astro', 'handlebars',
	'templ', 'gohtml', 'gotemplate', 'go-template',
] as const;

/**
 * `handlebars` is VS Code's own built-in language for `.hbs` / `.handlebars` /
 * `.hjs`, so it needs no companion extension — unlike every other entry here.
 *
 * It needed no scanner work either. Handlebars expressions, block helpers,
 * partials and comments all open with `{{`, which `TEMPLATE_CONSTRUCTS`
 * already skips for Twig, Liquid, Jinja and Blade, and the language has no
 * infix operators, so nothing in it produces a bare `<` outside markup.
 *
 * It was not already covered by `contributes.html/customData` despite VS
 * Code's HTML language service activating on it. That was measured, not
 * assumed: before this was added, asking for completions inside a `.hbs`
 * opening tag returned one item, none of them Alpine's, and hovering `x-show`
 * returned nothing at all.
 */

/**
 * The Go family, and which extension owns each ID.
 *
 * - `templ` — a-h.templ, for `.templ`. The odd one out: a `.templ` file is Go
 *   source with markup embedded in its `templ` blocks, not markup with a
 *   template layer, so the tag scan is restricted to those blocks. See
 *   `templMarkupRegions` in htmlContext.ts.
 * - `gohtml` — casualjim.gotemplate, for `.gohtml` / `.html.tmpl` and, unless
 *   the user overrides it, `.html` itself. Plain `html/template` markup.
 * - `gotemplate` — casualjim.gotemplate and karyan40024, for `.tmpl` / `.tpl`.
 * - `go-template` — jinliming2.vscode-go-template, for `.gtpl` / `.go.tmpl`.
 *
 * The last two also cover `.tmpl`/`.tpl` files holding YAML, Helm charts or
 * shell rather than markup. Nothing is offered there: every provider is gated
 * on being inside a markup tag, and those files have none.
 *
 * Hugo needs nothing here. budparr.language-hugo-vscode keeps the language ID
 * as `html`, so Hugo layouts are already served by the `html` registration —
 * it only replaces the grammar, which is a syntax-highlighting concern handled
 * by the `text.html.hugo` entry in syntaxes/alpine-injection.tmLanguage.json.
 *
 * Go's `{{ … }}` and `{{% … %}}` delimiters needed no work either: they were
 * already in `TEMPLATE_CONSTRUCTS` for Twig, Liquid, Jinja and Blade, and
 * Hugo's `{{< shortcode >}}` is skipped by the same rule — which is what stops
 * the `<` inside one from opening a bogus tag.
 */
export const GO_LANGUAGES = [
	'templ', 'gohtml', 'gotemplate', 'go-template',
] as const;

/** The language ID contributed by a-h.templ for `.templ` files. */
export const TEMPL_LANGUAGE = 'templ';

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

/**
 * Markup languages whose attribute-name completions and snippets have to come
 * from attributeCompletionProvider.ts rather than from package.json.
 *
 * `contributes.html/customData` is read only by VS Code's own HTML language
 * service, which serves none of these, and `contributes.snippets` has no
 * context field — so a declarative registration would offer `x-data="{ }"` in
 * the middle of Astro's TypeScript frontmatter, a `.templ` file's Go code, or
 * a Helm chart's YAML. The provider gates on being inside a tag instead.
 */
export const PROVIDER_SNIPPET_LANGUAGES = [
	'astro', ...GO_LANGUAGES,
] as const;
