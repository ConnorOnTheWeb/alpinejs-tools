/**
 * htmlDocument.ts
 *
 * Thin `vscode.TextDocument` adapter over the pure scanner in htmlContext.ts,
 * so that module stays free of the vscode API and directly unit-testable.
 * Mirrors jsxDocument.ts.
 */

import * as vscode from 'vscode';
import { findHtmlTagRanges } from './htmlContext';
import { createRangeCache, isInRanges, type TagRange } from './tagRanges';

const markupRanges = createRangeCache(text => findHtmlTagRanges(text));
const rangesWithComments = createRangeCache(
	text => findHtmlTagRanges(text, { includeComments: true }),
);

/**
 * Cached opening-tag attribute regions for `document`, commented-out markup
 * excluded — the set diagnostics report against.
 */
export function htmlTagRangesFor(document: vscode.TextDocument): TagRange[] {
	return markupRanges(
		document.uri.toString(),
		document.version,
		() => document.getText(),
	);
}

/**
 * True when `position` sits inside an HTML opening tag's attribute region,
 * counting commented-out markup as a tag.
 *
 * This is the one place the two consumers want different answers, so it is one
 * flag in one module rather than two scanners that drift. Diagnostics push
 * warnings at you unasked, so a typo inside `<!-- … -->` should stay quiet.
 * Hover and completions only ever answer where the cursor already is, so
 * hovering `@click` in a block of commented-out markup should still work.
 */
export function isInsideHtmlTagAt(
	document: vscode.TextDocument,
	position: vscode.Position,
): boolean {
	const ranges = rangesWithComments(
		document.uri.toString(),
		document.version,
		() => document.getText(),
	);
	return isInRanges(ranges, document.offsetAt(position));
}
