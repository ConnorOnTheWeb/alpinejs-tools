/**
 * diagnosticProvider.ts
 *
 * Reports unknown Alpine.js directives as warnings.
 *
 * Strategy
 * ────────
 * Scan each open document for `x-*` attribute occurrences using a regex.
 * Extract the base directive name (the part before `:` or `.`) and check it
 * against the known-directives set. Unknown names produce a Warning diagnostic
 * so that common typos (`x-dat`, `x-models`) are caught immediately.
 *
 * Official Alpine plugin directives (`x-intersect`, `x-collapse`, etc.) are
 * recognised and never flagged, even without the plugin package present.
 *
 * The scan is restricted to spans that are structurally inside an opening
 * tag's attribute region, because Alpine syntax is only ever an attribute
 * name. Everywhere else, an `x-…` shaped match is a coincidence: `x-axis` in a
 * sentence, `x-y` in a `<script>` block, `x-offset` in a TODO comment, or
 * `const diff = x-y > 0` in the JavaScript that makes up the rest of a JSX
 * document. htmlContext.ts and jsxContext.ts supply the regions.
 *
 * Both diagnostics are configurable per-resource (see config.ts) and are
 * reported at Warning severity unless told otherwise. They are configured
 * separately because they fail differently — the unknown-directive check is
 * the heuristic one, the JSX shorthand check is reporting a hard syntax error.
 *
 * Diagnostics are debounced (500 ms) to avoid firing on every keystroke.
 */

import * as vscode from 'vscode';
import { ALPINE_LANGUAGES_SET, isJsxLanguage } from './constants';
import { htmlTagRangesFor } from './htmlDocument';
import { jsxTagRangesFor } from './jsxDocument';
import { isInRanges, type TagRange } from './tagRanges';
import {
	affectsThisExtension,
	extraDirectives,
	jsxShorthandSeverity,
	unknownDirectiveSeverity,
} from './config';

// ─── Known directive sets ─────────────────────────────────────────────────────

/** Core Alpine.js v3 directives (the part after `x-`). */
const CORE_DIRECTIVES = new Set([
	'data', 'init', 'show', 'bind', 'on', 'text', 'html',
	'model', 'modelable', 'for', 'transition', 'effect',
	'ignore', 'ref', 'cloak', 'teleport', 'if', 'id',
]);

/**
 * Official Alpine.js plugin directives. These are always treated as valid
 * regardless of whether the plugin package is installed.
 */
const PLUGIN_DIRECTIVES = new Set([
	'intersect',  // @alpinejs/intersect
	'collapse',   // @alpinejs/collapse
	'sort',       // @alpinejs/sort
	'mask',       // @alpinejs/mask
	'trap',       // @alpinejs/focus (directive is `x-trap`, not `x-focus`)
	'anchor',     // @alpinejs/anchor
	// @alpinejs/morph and @alpinejs/persist expose JS APIs, not directives ($persist is a magic property, handled in extension.ts).
]);

// Matches `x-something`, `x-on:click`, `x-bind:class`, `x-transition.enter`
// (?<=\s) requires whitespace before x- so mid-word occurrences like `translate-x-1/2`
// are skipped. (?=[=\s>]|$) requires the directive to be followed by `=`, whitespace,
// `>`, or end-of-string — ruling out class fragments like `x-1/2` (followed by `/`).
const ALPINE_DIRECTIVE_RE = /(?<=\s)x-([\w][\w-]*(?:[:.][^\s=>'"]*)?)(?=[=\s>]|$)/g;

/** Pre-built flat array of all valid directive base names for suggestion lookup. */
const ALL_DIRECTIVES = [...CORE_DIRECTIVES, ...PLUGIN_DIRECTIVES];

// Matches Alpine's `@event` / `:attr` shorthand used as a JSX attribute name.
// Only ever applied inside a JSX opening tag, so the surrounding context is
// already known to be an attribute position. Requires a following `=` so that
// a spread (`{...props}`) or a bare `:` can't match.
// Group 1 = sigil, group 2 = the name after it.
const ALPINE_SHORTHAND_RE = /(?<=\s)([@:])([\w:.-]+)(?=\s*=)/g;

/** `@click.prevent` → `x-on:click.prevent`; `:class` → `x-bind:class`. */
function expandShorthand(sigil: string, name: string): string {
	return sigil === '@' ? `x-on:${name}` : `x-bind:${name}`;
}

function buildShorthandDiagnostic(
	document: vscode.TextDocument,
	match: RegExpExecArray,
	severity: vscode.DiagnosticSeverity,
): vscode.Diagnostic {
	const [full, sigil, name] = match;
	const long = expandShorthand(sigil, name);
	const diag = new vscode.Diagnostic(
		new vscode.Range(
			document.positionAt(match.index),
			document.positionAt(match.index + full.length),
		),
		`\`${full}\` is not a valid JSX attribute name — Alpine's ` +
			`${sigil} shorthand only works in HTML templates. Use \`${long}\` instead.`,
		severity,
	);
	diag.source = 'Alpine.js Tools';
	diag.code = 'jsx-shorthand';
	return diag;
}

function getBaseDirective(raw: string): string {
	// 'on:click.prevent' → 'on'
	// 'transition.enter' → 'transition'
	// 'bind:class'       → 'bind'
	// 'data'             → 'data'
	return raw.split(':')[0].split('.')[0];
}

function buildDiagnostic(
	document: vscode.TextDocument,
	match: RegExpExecArray,
	base: string,
	severity: vscode.DiagnosticSeverity,
	extras: Set<string>,
): vscode.Diagnostic {
	const start = document.positionAt(match.index);
	const end = document.positionAt(match.index + match[0].length);
	const range = new vscode.Range(start, end);

	// Search core, plugin and user-configured directives; prefer shortest edit
	// distance. Require at least a 2-character shared prefix (1-char for
	// length-1 bases) to avoid false positives like x-modl → x-mask instead of
	// x-model.
	const prefixLen = Math.min(base.length, 2);
	const basePrefix = base.slice(0, prefixLen);
	let closest: string | undefined;
	let bestDist = Infinity;
	for (const d of [...ALL_DIRECTIVES, ...extras]) {
		if (!d.startsWith(basePrefix)) { continue; }
		const dist = Math.abs(d.length - base.length);
		if (dist <= 2 && dist < bestDist) {
			closest = d;
			bestDist = dist;
		}
	}

	const hint = closest
		? ` Did you mean \`x-${closest}\`?`
		: ` Valid directives: ${[...CORE_DIRECTIVES, ...extras].join(', ')}.`;

	const diag = new vscode.Diagnostic(
		range,
		`Unknown Alpine.js directive 'x-${base}'.${hint}`,
		severity,
	);
	diag.source = 'Alpine.js Tools';
	diag.code = 'unknown-directive';
	return diag;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 500;

export function createAlpineDiagnosticProvider(
	context: vscode.ExtensionContext,
): vscode.DiagnosticCollection {
	const collection =
		vscode.languages.createDiagnosticCollection('alpinejs-tools');

	const timers = new Map<string, NodeJS.Timeout>();

	function diagnose(document: vscode.TextDocument): void {
		if (!ALPINE_LANGUAGES_SET.has(document.languageId)) { return; }

		const isJsx = isJsxLanguage(document.languageId);
		const unknownSeverity = unknownDirectiveSeverity(document.uri);
		// The shorthand check only ever runs in JSX, so don't read its setting
		// (or compute tag ranges on its behalf) anywhere else.
		const shorthandSeverity = isJsx
			? jsxShorthandSeverity(document.uri)
			: undefined;

		// Both checks off for this document — clear anything a previous run
		// left behind rather than leaving stale squiggles in the Problems
		// panel, which is what turning them off is meant to achieve.
		if (unknownSeverity === undefined && shorthandSeverity === undefined) {
			collection.delete(document.uri);
			return;
		}

		const text = document.getText();
		const diagnostics: vscode.Diagnostic[] = [];

		// Alpine syntax is only ever an attribute name, so reporting is
		// restricted to opening tags' attribute regions. Both families need
		// this and for the same reason, but they find the regions differently:
		// in JSX the rest of the document is JavaScript (`const diff = x-y > 0`
		// matches the directive regex exactly), in HTML it is prose, script
		// bodies and comments (`the x-axis of the chart`).
		const tagRanges: TagRange[] = isJsx
			? jsxTagRangesFor(document)
			: htmlTagRangesFor(document);

		if (unknownSeverity !== undefined) {
			// Directives registered by third-party plugins, which the bundled
			// list cannot know about. Empty unless configured, so the check is
			// unchanged for anyone who hasn't set it.
			const extras = extraDirectives(document.uri);

			ALPINE_DIRECTIVE_RE.lastIndex = 0;
			let match: RegExpExecArray | null;

			while ((match = ALPINE_DIRECTIVE_RE.exec(text)) !== null) {
				if (!isInRanges(tagRanges, match.index)) { continue; }
				const base = getBaseDirective(match[1]);
				if (
					!CORE_DIRECTIVES.has(base) &&
					!PLUGIN_DIRECTIVES.has(base) &&
					!extras.has(base)
				) {
					diagnostics.push(
						buildDiagnostic(document, match, base, unknownSeverity, extras),
					);
				}
			}
		}

		// JSX only: Alpine's `@event` / `:attr` shorthands aren't valid JSX
		// attribute names. TypeScript already refuses to parse them, but it
		// reports `TS1003 Identifier expected` pointing at the `@`, which says
		// nothing about Alpine and offers no way forward. Name the actual
		// problem and let the code action rewrite it to the long form.
		if (shorthandSeverity !== undefined) {
			ALPINE_SHORTHAND_RE.lastIndex = 0;
			let sh: RegExpExecArray | null;
			while ((sh = ALPINE_SHORTHAND_RE.exec(text)) !== null) {
				if (!isInRanges(tagRanges, sh.index)) { continue; }
				diagnostics.push(buildShorthandDiagnostic(document, sh, shorthandSeverity));
			}
		}

		collection.set(document.uri, diagnostics);
	}

	function scheduleDiagnose(document: vscode.TextDocument): void {
		const key = document.uri.toString();
		const existing = timers.get(key);
		if (existing !== undefined) { clearTimeout(existing); }
		timers.set(
			key,
			setTimeout(() => {
				diagnose(document);
				timers.delete(key);
			}, DEBOUNCE_MS),
		);
	}

	// Scan all already-open documents immediately
	for (const doc of vscode.workspace.textDocuments) {
		diagnose(doc);
	}

	context.subscriptions.push(
		// Re-run against every open document when a setting changes. Without
		// this, turning a diagnostic off leaves its squiggles in place until
		// each affected file happens to be edited — which reads as the setting
		// not working. Re-running is immediate rather than debounced: a
		// settings change is a deliberate act, not a keystroke.
		vscode.workspace.onDidChangeConfiguration(event => {
			if (!affectsThisExtension(event)) { return; }
			for (const doc of vscode.workspace.textDocuments) {
				diagnose(doc);
			}
		}),
		vscode.workspace.onDidOpenTextDocument(diagnose),
		vscode.workspace.onDidChangeTextDocument(e =>
			scheduleDiagnose(e.document),
		),
		vscode.workspace.onDidCloseTextDocument(doc => {
			collection.delete(doc.uri);
			const t = timers.get(doc.uri.toString());
			if (t !== undefined) { clearTimeout(t); timers.delete(doc.uri.toString()); }
		}),
		collection,
	);

	return collection;
}
