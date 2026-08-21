/**
 * htmlContext.ts
 *
 * Structural "where can an Alpine attribute appear?" analysis for the eight
 * HTML-family languages.
 *
 * Why this exists
 * ───────────────
 * Alpine syntax is only ever an attribute name. Everything else that looks like
 * it — `x-axis` in a sentence, `x-y` in a script block, `@foreach` in Blade
 * body text — is a false positive waiting to happen, and each one used to be
 * fixed with another guard bolted onto a regex. This walks the document once
 * and reports the attribute regions themselves, so the question becomes "is
 * this offset in one?" instead of "does this text look like a directive?".
 *
 * How it differs from the JSX scanner
 * ───────────────────────────────────
 * jsxContext.ts rejects a `<` as soon as it sees anything that can't appear in
 * a tag, because in JavaScript `<` is also the less-than operator and the
 * generic-argument delimiter — a wrong "yes" is the common case there. In HTML
 * the opposite is true: `<` is almost always a tag opener, and the things that
 * follow a tag name are whatever the template layer emits. Blade's `@if($x)`,
 * Twig's `{{ attrs }}` and EJS's `<%= attrs %>` all appear between a tag name
 * and its `>`, and rejecting on the `(` or the `<` would silently drop the
 * whole tag — costing hover and completions on the real Alpine attributes
 * beside them. So this scanner is tolerant: it skips what HTML and the
 * template languages say to skip, and otherwise keeps looking for the `>`.
 *
 * The one strictness kept from JSX is rejecting a bare `<` inside the region.
 * That is what stops `<p>5 < 6, and @click is shorthand</p>` from reporting the
 * body text as a tag.
 */

import { TEMPL_LANGUAGE } from './constants';
import type { TagRange } from './tagRanges';

/** First character of an element name. */
const NAME_START_RE = /[A-Za-z]/;
/** Subsequent characters of an element name (`my-widget`, `svg:use`). */
const NAME_CHAR_RE = /[\w.:-]/;

/**
 * Upper bound on how far the attribute scan will run before giving up.
 * A real opening tag's attribute region is never this long; the cap stops a
 * stray `<` in prose (`a <b, therefore c > d`) from opening a range that runs
 * to the end of the file.
 */
const MAX_ATTR_REGION = 4000;

/** HTML elements whose content is not markup. */
const RAW_TEXT_ELEMENTS = ['script', 'style'];

/**
 * Delimiter pairs for template constructs, skipped wherever they appear.
 *
 * Inside a tag they carry attributes the scan must step over rather than
 * choke on (`<div {{ attrs }} x-data="…">`). Outside one they carry the
 * template language's own code, which is JavaScript or PHP — and an
 * expression like `if (a<b) { … }` in there would otherwise open a bogus tag
 * that swallows the rest of the line, which is precisely the class of bug this
 * module exists to remove.
 */
const TEMPLATE_CONSTRUCTS: readonly (readonly [string, string])[] = [
	['<?', '?>'],   // PHP, XML declarations
	['<%', '%>'],   // EJS
	['{{', '}}'],   // Twig, Liquid, Jinja, Nunjucks, Blade echo
	['{%', '%}'],   // Twig, Liquid, Jinja, Nunjucks statements
	['{!!', '!!}'], // Blade unescaped echo
];

/**
 * Length of a leading front-matter block, or 0 when the file doesn't open with
 * one. The scan starts past it.
 *
 * Astro puts TypeScript there, fenced by `---`, and it is the only JavaScript
 * region in these languages that isn't delimited by a tag — so nothing else in
 * this module would skip it, and a comparison like `const wide = cols<bp;`
 * followed by `const diff = x-y > 0;` opens a region that swallows the `x-y`
 * and reports it as a directive. Jekyll, Hugo and Eleventy put YAML in the
 * same fence in `.html` and `.liquid` files, which is equally not markup, so
 * this is keyed on the fence rather than on the language.
 *
 * The closing fence must be a line of its own containing exactly `---`. With
 * no closing fence there is no front matter, and nothing is skipped — a stray
 * `---` at the top of a file must not blank the rest of it.
 */
function frontmatterEnd(text: string): number {
	const open = /^\s*---[ \t]*\r?\n/.exec(text);
	if (!open) { return 0; }

	let i = open[0].length;
	while (i < text.length) {
		const eol = text.indexOf('\n', i);
		const line = (eol === -1 ? text.slice(i) : text.slice(i, eol)).trim();
		if (line === '---') { return eol === -1 ? text.length : eol + 1; }
		i = eol === -1 ? text.length : eol + 1;
	}
	return 0;
}

/**
 * Start of a `templ` block declaration. templ's own grammar anchors this to
 * the start of a line, and so does this.
 */
const TEMPL_BLOCK_START_RE = /^templ[ \t]/gm;

/**
 * End of a `templ` block: a `}` alone on a line at column zero.
 *
 * This is not a guess — it is the same rule templ's own TextMate grammar uses
 * to close its `html-template` block (`end: "(?<=^}$)"`), and `templ fmt`
 * produces it, since a top-level Go declaration always closes at column zero
 * while the markup inside it is indented.
 */
const TEMPL_BLOCK_END_RE = /^\}[ \t]*\r?$/gm;

/**
 * The markup regions of a `.templ` file: the bodies of its `templ` blocks.
 *
 * Every other language here is markup that may contain code. templ is the
 * reverse — a `.templ` file is a Go source file, and markup exists only inside
 * its `templ` blocks. Scanning the whole document would mean scanning Go, and
 * a comparison like `if a<b && c>d {` opens a region that reports whatever
 * follows as attributes. Astro's single leading fence was enough to handle
 * with an offset; here the non-markup regions are interleaved with the markup
 * ones, so the scan is restricted to the markup rather than skipping past it.
 *
 * Restricting rather than skipping also excludes templ's `script` and `css`
 * blocks for free: they are separate top-level declarations holding JavaScript
 * and CSS, and neither is markup.
 *
 * A block with no closing brace yet — the state a file is in while it is being
 * typed — runs to the end of the document rather than being dropped, so
 * completions keep working in it.
 */
function templMarkupRegions(text: string): TagRange[] {
	const regions: TagRange[] = [];

	TEMPL_BLOCK_START_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TEMPL_BLOCK_START_RE.exec(text)) !== null) {
		// The block's opening brace. A templ signature holds a parameter list
		// and optional type parameters, neither of which can contain a brace,
		// so the first one after the keyword is the block's.
		const brace = text.indexOf('{', match.index);
		if (brace === -1) { break; }

		const start = brace + 1;
		TEMPL_BLOCK_END_RE.lastIndex = start;
		const end = TEMPL_BLOCK_END_RE.exec(text);
		const stop = end ? end.index : text.length;

		regions.push({ start, end: stop });
		TEMPL_BLOCK_START_RE.lastIndex = stop;
	}

	return regions;
}

/**
 * If a template construct opens at `i`, the index just past its close
 * (or end-of-text if it never closes). `-1` when none opens here.
 */
function templateConstructAt(text: string, i: number): number {
	for (const [open, close] of TEMPLATE_CONSTRUCTS) {
		if (!text.startsWith(open, i)) { continue; }
		const end = text.indexOf(close, i + open.length);
		return end === -1 ? text.length : end + close.length;
	}
	return -1;
}

/**
 * Skips a quoted attribute value starting at `i` (the opening quote), returning
 * the index just past the closing quote.
 *
 * Unlike the JSX scanner this does not stop at a newline: multi-line attribute
 * values are ordinary in Alpine markup (`x-data="{\n  open: false\n}"`). An
 * unterminated quote is bounded by `MAX_ATTR_REGION` instead.
 */
function skipQuoted(text: string, i: number): number {
	const end = text.indexOf(text[i], i + 1);
	return end === -1 ? text.length : end + 1;
}

/** An opening tag's attribute region, plus the element name that owns it. */
interface HtmlTag extends TagRange {
	/** Lowercased, for the raw-text-element check. */
	name: string;
}

/**
 * Attempts to parse an opening tag whose `<` is at `lt`, within a markup
 * region ending at `regionEnd`.
 * Returns its attribute region, or `null` if this `<` isn't a tag.
 *
 * An unterminated region (no `>` before the end of the markup) is still
 * reported, as a range extending to the end of it. That is the case the user
 * is in the middle of while typing `<div x-`, and completions have to work
 * there. A region that runs past the length cap without closing is rejected
 * instead — that isn't a tag being typed, it's a `<` that never opened one.
 *
 * `regionEnd` is the document length in every language but templ, where it is
 * the end of the enclosing `templ` block.
 *
 * `rawStrings` adds the backtick to the quote characters that get skipped.
 * Only templ needs it: an attribute value there can be a Go expression, and a
 * Go raw string is the natural way to write one containing quotes, as in
 * data-json={ `{"a": 1 < 2}` }. Without the skip, a `<` or `>` inside one is
 * read as markup, which either ends the attribute region early or rejects the
 * whole tag. Left off elsewhere: no other language here gives the backtick a
 * meaning inside a tag, and treating a stray one as an opening quote would
 * swallow the rest of the tag.
 */
function scanHtmlTag(
	text: string,
	lt: number,
	regionEnd: number,
	rawStrings: boolean,
): HtmlTag | null {
	let i = lt + 1;
	if (i >= regionEnd || !NAME_START_RE.test(text[i])) { return null; }
	const nameStart = i;
	while (i < regionEnd && NAME_CHAR_RE.test(text[i])) { i++; }
	const name = text.slice(nameStart, i).toLowerCase();

	const start = i;
	const limit = Math.min(regionEnd, start + MAX_ATTR_REGION);

	while (i < limit) {
		const construct = templateConstructAt(text, i);
		if (construct !== -1) { i = construct; continue; }
		const c = text[i];
		if (c === '"' || c === "'" || (rawStrings && c === '`')) {
			i = skipQuoted(text, i);
			continue;
		}
		if (c === '>') { return { start, end: i, name }; }
		// A second `<` outside a quoted value or a template construct means the
		// first one wasn't a tag opener — it was a less-than in body text.
		if (c === '<') { return null; }
		i++;
	}

	return limit === regionEnd ? { start, end: regionEnd, name } : null;
}

export interface HtmlTagRangeOptions {
	/**
	 * Scan inside `<!-- … -->` as ordinary markup.
	 *
	 * Diagnostics leave this off: a typo in code you commented out is noise you
	 * didn't ask for. Hover and completions turn it on: hovering commented-out
	 * markup is you asking. See htmlDocument.ts.
	 */
	includeComments?: boolean;

	/**
	 * The document's language ID, when it changes where markup can be found.
	 *
	 * Only templ uses it — its markup lives inside `templ` blocks rather than
	 * spanning the file. Every other language scans the whole document, so
	 * leaving this unset keeps the behaviour they have always had.
	 */
	languageId?: string;
}

/**
 * Walks one markup region, appending the attribute region of every opening tag
 * it finds to `ranges`.
 */
function scanMarkupRegion(
	text: string,
	lower: string,
	from: number,
	to: number,
	options: HtmlTagRangeOptions,
	ranges: TagRange[],
): void {
	let i = from;

	while (i < to) {
		if (!options.includeComments && text.startsWith('<!--', i)) {
			const close = text.indexOf('-->', i + 4);
			i = close === -1 || close > to ? to : close + 3;
			continue;
		}
		const construct = templateConstructAt(text, i);
		if (construct !== -1) { i = construct; continue; }

		if (text[i] === '<') {
			const tag = scanHtmlTag(text, i, to, options.languageId === TEMPL_LANGUAGE);
			if (tag) {
				ranges.push({ start: tag.start, end: tag.end });
				if (RAW_TEXT_ELEMENTS.includes(tag.name)) {
					// The opening tag itself is a tag and keeps its range — an
					// Alpine attribute can legitimately live there. Its body is
					// JavaScript or CSS, so skip to the closing tag.
					const close = lower.indexOf(`</${tag.name}`, tag.end);
					i = close === -1 || close > to ? to : close;
				} else {
					i = tag.end + 1;
				}
				continue;
			}
		}
		i++;
	}
}

/** Attribute regions of every opening tag in `text`, in source order. */
export function findHtmlTagRanges(
	text: string,
	options: HtmlTagRangeOptions = {},
): TagRange[] {
	const ranges: TagRange[] = [];
	const lower = text.toLowerCase();

	// One region spanning the document for markup languages, past any front
	// matter; the `templ` block bodies for templ.
	const regions = options.languageId === TEMPL_LANGUAGE
		? templMarkupRegions(text)
		: [{ start: frontmatterEnd(text), end: text.length }];

	for (const region of regions) {
		scanMarkupRegion(text, lower, region.start, region.end, options, ranges);
	}

	return ranges;
}
