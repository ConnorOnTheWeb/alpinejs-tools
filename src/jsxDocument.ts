/**
 * jsxDocument.ts
 *
 * Thin `vscode.TextDocument` adapter over the pure scanner in jsxContext.ts,
 * so that module stays free of the vscode API and directly unit-testable.
 */

import * as vscode from 'vscode';
import { getJsxTagRanges } from './jsxContext';
import { isInRanges, type TagRange } from './tagRanges';

/** Cached JSX opening-tag attribute regions for `document`. */
export function jsxTagRangesFor(document: vscode.TextDocument): TagRange[] {
	return getJsxTagRanges(
		document.uri.toString(),
		document.version,
		() => document.getText(),
	);
}

/** True when `position` sits inside a JSX opening tag's attribute region. */
export function isInsideJsxTagAt(
	document: vscode.TextDocument,
	position: vscode.Position,
): boolean {
	return isInRanges(jsxTagRangesFor(document), document.offsetAt(position));
}

let alpineRefKey: string | undefined;
let alpineRefVersion = -1;
let alpineRefValue = false;

/**
 * True when the document references the Alpine global at all.
 *
 * Used to decide whether Alpine's magic-property and modifier snippets belong
 * in a JS/TS document outside any JSX tag. They're genuinely useful in an
 * `Alpine.data(…)` body, which is ordinary JavaScript — but offering `$el`,
 * `$store` and friends on a bare `$` in a React file that has nothing to do
 * with Alpine is exactly the noise this extension is supposed to avoid.
 * Presence of `Alpine.` is the signal, and it's the real global rather than a
 * guess about file naming or project layout.
 *
 * Cached per document version, like the tag ranges.
 */
export function referencesAlpine(document: vscode.TextDocument): boolean {
	const key = document.uri.toString();
	if (key === alpineRefKey && document.version === alpineRefVersion) {
		return alpineRefValue;
	}
	alpineRefKey = key;
	alpineRefVersion = document.version;
	alpineRefValue = document.getText().includes('Alpine.');
	return alpineRefValue;
}
