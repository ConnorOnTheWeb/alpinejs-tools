/**
 * jsxCompletionProvider.ts
 *
 * Directive-name and snippet completions for JSX-family documents.
 *
 * Why this exists
 * ───────────────
 * In HTML-family languages both of these come from declarative contributions
 * in package.json: `contributes.html/customData` supplies the `x-data` /
 * `x-show` attribute-name IntelliSense, and `contributes.snippets` supplies
 * the snippet bodies. Neither reaches a `.tsx` file — `html/customData` is
 * read only by VS Code's HTML language service, and a snippet contribution is
 * scoped by language with no context field, so registering one for
 * `typescriptreact` would offer `x-data="{ }"` in the middle of ordinary
 * TypeScript.
 *
 * Delivering both through a completion provider instead gets the same UX with
 * real context gating: attribute snippets are offered only inside a JSX
 * opening tag, everything else (`alpine-data`, `template-if`, `$watch`,
 * `.prevent`) only outside one. Inside a directive's value the provider stands
 * down entirely — the magic-property and modifier providers in extension.ts
 * own that position, so nothing is offered twice.
 *
 * This provider also serves `javascript`, which used to get the snippets
 * declaratively. That registration was removed rather than kept alongside, so
 * `.js` files get one gated copy instead of two ungated ones.
 *
 * Snippet bodies are read from the same `snippets/alpine.code-snippets` file
 * the HTML languages use, so there is one definition of each snippet. Bodies
 * are rewritten on the way through: `x-for`'s and `template-for`'s
 * `:key="…"` is Alpine shorthand that is a syntax error in JSX, so it becomes
 * `x-bind:key="…"`.
 */

import * as vscode from 'vscode';
import { JSX_LANGUAGES } from './constants';
import { JSX_DIRECTIVE_VALUE_RE } from './jsxContext';
import { isInsideJsxTagAt, referencesAlpine } from './jsxDocument';

/** One entry of the bundled `alpine.html-data.json` custom-data file. */
export interface AlpineAttr {
	name: string;
	description: string;
	references: Array<{ name: string; url: string }>;
}

/** One entry of the bundled `alpine.code-snippets` file. */
interface SnippetDef {
	prefix: string;
	body: string | string[];
	description?: string;
}

/**
 * A completion item's language-independent parts, built once at activation.
 * The `range` is the only field that varies per request, so the vscode object
 * itself is constructed fresh each time rather than shared and mutated.
 */
interface ItemSpec {
	label: string;
	kind: vscode.CompletionItemKind;
	detail: string;
	/** Snippet body, already rewritten for JSX. */
	body: string;
	documentation: vscode.MarkdownString;
}

/**
 * Directives that take no value. Everything else defaults to `name="$1"$0`
 * when the snippets file has no entry for it.
 */
const BOOLEAN_DIRECTIVES = new Set(['x-cloak', 'x-ignore']);

/**
 * Rewrites a snippet body for JSX. Alpine's `:attr` and `@event` shorthands
 * are not valid JSX attribute names (TS1003 / TS1382), so any shorthand a
 * snippet emits is expanded to the long form, which is a valid JSX namespaced
 * name and type-checks cleanly.
 */
function toJsxSnippetBody(body: string | string[]): string {
	const text = Array.isArray(body) ? body.join('\n') : body;
	return text
		.replace(/(^|\s):([\w-]+)=/g, '$1x-bind:$2=')
		.replace(/(^|\s)@([\w.-]+)=/g, '$1x-on:$2=');
}

/** A snippet whose prefix is an attribute name (`x-data`, `x-mask:dynamic`). */
function isAttributeSnippet(prefix: string): boolean {
	return prefix.startsWith('x-');
}

/**
 * A scaffold snippet — `template-for`, `template-if`, `alpine-data`,
 * `alpine-store`. Offered outside a JSX tag unconditionally: the prefixes are
 * distinctive enough that they can't collide with ordinary code.
 */
function isScaffoldSnippet(prefix: string): boolean {
	return !prefix.startsWith('x-') && !prefix.startsWith('$') && !prefix.startsWith('.');
}

/**
 * A magic-property (`$watch`) or modifier (`.prevent`) snippet.
 *
 * These belong in an `Alpine.data(…)` body, which is ordinary JavaScript
 * outside any JSX tag — so `contributes.snippets` used to offer them anywhere
 * in a `.js` file, and dropping that registration would have been a
 * regression. But `$` and `.` are the two most common characters in
 * JavaScript, so they're only offered in documents that actually reference
 * Alpine (see `referencesAlpine`).
 */
function isAlpineOnlySnippet(prefix: string): boolean {
	return prefix.startsWith('$') || prefix.startsWith('.');
}

export function createJsxCompletionProvider(
	context: vscode.ExtensionContext,
	attrs: AlpineAttr[],
	snippets: Record<string, SnippetDef>,
): void {
	const attrMap = new Map(attrs.map(a => [a.name, a]));
	const snippetByPrefix = new Map(
		Object.values(snippets).map(s => [s.prefix, s]),
	);

	// ── Attribute-name items — offered inside a JSX opening tag ───────────────
	// Union of the custom-data directive list (authoritative, carries the
	// descriptions and doc links) and any additional attribute-shaped snippet
	// prefixes such as `x-intersect.enter` and `x-sort:handle`.
	const attributeNames = [
		...new Set([
			...attrs.map(a => a.name),
			...[...snippetByPrefix.keys()].filter(isAttributeSnippet),
		]),
	].sort();

	const attributeItems: ItemSpec[] = attributeNames.map(name => {
		const snippet = snippetByPrefix.get(name);
		const body = snippet
			? toJsxSnippetBody(snippet.body)
			: BOOLEAN_DIRECTIVES.has(name)
				? name
				: `${name}="$1"$0`;

		const attr = attrMap.get(name.split(/[.:]/)[0]);
		const md = new vscode.MarkdownString('', true);
		md.isTrusted = true;
		md.appendMarkdown(
			`**\`${name}\`** — Alpine.js directive\n\n${
				attr?.description ?? snippet?.description ?? ''
			}`,
		);
		for (const ref of attr?.references ?? []) {
			md.appendMarkdown(`\n\n[${ref.name}](${ref.url})`);
		}

		return {
			label: name,
			kind: vscode.CompletionItemKind.Property,
			detail: 'Alpine.js directive',
			body,
			documentation: md,
		};
	});

	// ── Items offered outside a JSX opening tag ───────────────────────────────
	const toSnippetItem = (s: SnippetDef): ItemSpec => ({
		label: s.prefix,
		kind: vscode.CompletionItemKind.Snippet,
		detail: 'Alpine.js snippet',
		body: toJsxSnippetBody(s.body),
		documentation: new vscode.MarkdownString(s.description ?? ''),
	});
	const allSnippets = [...snippetByPrefix.values()];
	const scaffoldItems = allSnippets.filter(s => isScaffoldSnippet(s.prefix)).map(toSnippetItem);
	const alpineOnlyItems = allSnippets.filter(s => isAlpineOnlySnippet(s.prefix)).map(toSnippetItem);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			JSX_LANGUAGES.map(language => ({ language })),
			{
				provideCompletionItems(
					document: vscode.TextDocument,
					position: vscode.Position,
				): vscode.CompletionItem[] | undefined {
					const linePrefix = document
						.lineAt(position)
						.text.slice(0, position.character);

					// Inside a directive's value the completions belong to the
					// value provider, not here.
					if (JSX_DIRECTIVE_VALUE_RE.test(linePrefix)) { return undefined; }

					const source = isInsideJsxTagAt(document, position)
						? attributeItems
						: referencesAlpine(document)
							? [...scaffoldItems, ...alpineOnlyItems]
							: scaffoldItems;

					// Replace the partial token being typed, so that `x-da`
					// resolves to `x-data` rather than `x-dax-data`.
					const typed = /[\w$@:.-]*$/.exec(linePrefix)?.[0] ?? '';
					const replaceRange = new vscode.Range(
						new vscode.Position(position.line, position.character - typed.length),
						position,
					);

					return source.map(spec => {
						const item = new vscode.CompletionItem(spec.label, spec.kind);
						item.detail = spec.detail;
						item.documentation = spec.documentation;
						item.insertText = new vscode.SnippetString(spec.body);
						item.range = replaceRange;
						return item;
					});
				},
			},
		),
	);
}
