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
 * Attempts to parse an opening tag whose `<` is at `lt`.
 * Returns its attribute region, or `null` if this `<` isn't a tag.
 *
 * An unterminated region (no `>` before end-of-text) is still reported, as a
 * range extending to the end of the text. That is the case the user is in the
 * middle of while typing `<div x-`, and completions have to work there. A
 * region that runs past the length cap without closing is rejected instead —
 * that isn't a tag being typed, it's a `<` that never opened one.
 */
function scanHtmlTag(text: string, lt: number): HtmlTag | null {
	let i = lt + 1;
	if (i >= text.length || !NAME_START_RE.test(text[i])) { return null; }
	const nameStart = i;
	while (i < text.length && NAME_CHAR_RE.test(text[i])) { i++; }
	const name = text.slice(nameStart, i).toLowerCase();

	const start = i;
	const limit = Math.min(text.length, start + MAX_ATTR_REGION);

	while (i < limit) {
		const construct = templateConstructAt(text, i);
		if (construct !== -1) { i = construct; continue; }
		const c = text[i];
		if (c === '"' || c === "'") { i = skipQuoted(text, i); continue; }
		if (c === '>') { return { start, end: i, name }; }
		// A second `<` outside a quoted value or a template construct means the
		// first one wasn't a tag opener — it was a less-than in body text.
		if (c === '<') { return null; }
		i++;
	}

	return limit === text.length ? { start, end: text.length, name } : null;
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
}

/** Attribute regions of every opening tag in `text`, in source order. */
export function findHtmlTagRanges(
	text: string,
	options: HtmlTagRangeOptions = {},
): TagRange[] {
	const ranges: TagRange[] = [];
	const lower = text.toLowerCase();
	let i = 0;

	while (i < text.length) {
		if (!options.includeComments && text.startsWith('<!--', i)) {
			const close = text.indexOf('-->', i + 4);
			i = close === -1 ? text.length : close + 3;
			continue;
		}
		const construct = templateConstructAt(text, i);
		if (construct !== -1) { i = construct; continue; }

		if (text[i] === '<') {
			const tag = scanHtmlTag(text, i);
			if (tag) {
				ranges.push({ start: tag.start, end: tag.end });
				if (RAW_TEXT_ELEMENTS.includes(tag.name)) {
					// The opening tag itself is a tag and keeps its range — an
					// Alpine attribute can legitimately live there. Its body is
					// JavaScript or CSS, so skip to the closing tag.
					const close = lower.indexOf(`</${tag.name}`, tag.end);
					i = close === -1 ? text.length : close;
				} else {
					i = tag.end + 1;
				}
				continue;
			}
		}
		i++;
	}

	return ranges;
}
