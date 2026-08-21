import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
	initWorkspaceScanner,
	rescanWorkspace,
	getOutputChannel,
	getAlpineDataNames,
	getAlpineDataLocations,
	getAlpineStoreNames,
	getXRefNames,
	getXDataProps,
} from './workspaceScanner';
import { createAlpineDiagnosticProvider } from './diagnosticProvider';
import { createAlpineCodeActionProvider } from './codeActionProvider';
import {
	createAttributeCompletionProvider,
	toJsxSnippetBody,
	toMarkupSnippetBody,
	type AlpineAttr,
} from './attributeCompletionProvider';
import {
	ALPINE_LANGUAGES,
	JSX_LANGUAGES,
	PROVIDER_SNIPPET_LANGUAGES,
	isJsxLanguage,
} from './constants';
import { isInsideJsxTagAt } from './jsxDocument';
import { isInsideHtmlTagAt } from './htmlDocument';
import { JSX_DIRECTIVE_VALUE_RE } from './jsxContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MagicDef {
	label: string;
	detail: string;
	doc: string;
	insert: string;
}

// ─── Alpine magic properties ──────────────────────────────────────────────────

const ALPINE_MAGICS: MagicDef[] = [
	{
		label: '$el',
		detail: 'HTMLElement',
		doc: 'The root DOM element of the current Alpine component.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/el)',
		insert: '\\$el',
	},
	{
		label: '$refs',
		detail: 'Record<string, HTMLElement>',
		doc: 'Access DOM elements marked with `x-ref` by name.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/refs)',
		insert: '\\$refs.${1:name}',
	},
	{
		label: '$store',
		detail: 'any',
		doc: 'Access a global store registered with `Alpine.store()`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/store)',
		insert: '\\$store.${1:storeName}',
	},
	{
		label: '$watch',
		detail: '(property: string, callback: (value: any) => void) => void',
		doc: 'Watch a data property and run a callback when it changes.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/watch)',
		insert: "\\$watch('${1:property}', (value) => {\n\t$0\n})",
	},
	{
		label: '$dispatch',
		detail: '(event: string, detail?: any) => void',
		doc: 'Dispatch a custom DOM event from the current element.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/dispatch)',
		insert: "\\$dispatch('${1:event}'${2:, { $3 }})",
	},
	{
		label: '$nextTick',
		detail: '(callback?: () => void) => Promise<void>',
		doc: 'Execute a callback after Alpine has finished updating the DOM.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/nexttick)',
		insert: "\\$nextTick(() => {\n\t$0\n})",
	},
	{
		label: '$root',
		detail: 'HTMLElement',
		doc: 'The nearest ancestor element with `x-data`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/root)',
		insert: '\\$root',
	},
	{
		label: '$data',
		detail: 'Record<string, any>',
		doc: 'The full reactive data object of the current component.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/data)',
		insert: '\\$data',
	},
	{
		label: '$id',
		detail: '(name: string, key?: number | string) => string',
		doc: 'Generate a unique, scoped ID string. Used with `x-id`.\n\n[Alpine.js Docs](https://alpinejs.dev/magics/id)',
		insert: "\\$id('${1:name}')",
	},
	{
		label: '$persist',
		detail: '(defaultValue: any) => any',
		doc: '**Requires `@alpinejs/persist` plugin.** Persists a data property to storage (`localStorage` by default) so it survives page reloads. Chain `.as(key)` for a custom storage key and `.using(storage)` for an alternative backend.\n\n[Alpine.js Docs](https://alpinejs.dev/plugins/persist)',
		insert: '\\$persist(${1:value})',
	},
	{
		label: '$event',
		detail: 'Event',
		doc: 'The native browser Event object, available inside an `x-on` (or `@event`) handler expression.\n\n[Alpine.js Docs](https://alpinejs.dev/directives/on)',
		insert: '\\$event',
	},
];

const MAGIC_MAP = new Map(ALPINE_MAGICS.map(m => [m.label, m]));

// ─── Modifier definitions ─────────────────────────────────────────────────────

interface ModifierDef {
	name: string;
	detail: string;
}

const EVENT_MODIFIERS: ModifierDef[] = [
	{ name: 'prevent', detail: 'Call event.preventDefault()' },
	{ name: 'stop', detail: 'Call event.stopPropagation()' },
	{ name: 'self', detail: 'Only fire if event.target is the element itself' },
	{ name: 'outside', detail: 'Only fire when the event occurs outside the element (click.outside)' },
	{ name: 'window', detail: 'Add listener to the window object' },
	{ name: 'document', detail: 'Add listener to the document object' },
	{ name: 'once', detail: 'Fire the handler at most once' },
	{ name: 'passive', detail: 'Mark listener as passive (no preventDefault)' },
	{ name: 'debounce', detail: 'Debounce the handler (default 250ms)' },
	{ name: 'throttle', detail: 'Throttle the handler (default 250ms)' },
	{ name: 'camel', detail: 'Convert event name from kebab-case to camelCase' },
	{ name: 'dot', detail: 'Convert dashes in event name to literal dots' },
	// Key modifiers
	{ name: 'enter', detail: 'Fire only on Enter key' },
	{ name: 'escape', detail: 'Fire only on Escape key' },
	{ name: 'space', detail: 'Fire only on Space key' },
	{ name: 'tab', detail: 'Fire only on Tab key' },
	{ name: 'arrow-up', detail: 'Fire only on ArrowUp key' },
	{ name: 'arrow-down', detail: 'Fire only on ArrowDown key' },
	{ name: 'arrow-left', detail: 'Fire only on ArrowLeft key' },
	{ name: 'arrow-right', detail: 'Fire only on ArrowRight key' },
	{ name: 'ctrl', detail: 'Require Ctrl to be held' },
	{ name: 'alt', detail: 'Require Alt to be held' },
	{ name: 'shift', detail: 'Require Shift to be held' },
	{ name: 'meta', detail: 'Require Meta (Cmd/Win) to be held' },
];

const MODEL_MODIFIERS: ModifierDef[] = [
	{ name: 'lazy', detail: 'Sync on change event instead of input' },
	{ name: 'number', detail: 'Cast value to a number' },
	{ name: 'boolean', detail: 'Cast value to a boolean' },
	{ name: 'trim', detail: 'Trim whitespace from value' },
];

const TRANSITION_MODIFIERS: ModifierDef[] = [
	{ name: 'enter', detail: 'Scoped to the enter phase only' },
	{ name: 'leave', detail: 'Scoped to the leave phase only' },
	{ name: 'opacity', detail: 'Transition opacity only' },
	{ name: 'scale', detail: 'Transition scale only (default 95%)' },
	{ name: 'origin-top', detail: 'Set transform-origin to top' },
	{ name: 'origin-top-right', detail: 'Set transform-origin to top right' },
	{ name: 'origin-right', detail: 'Set transform-origin to right' },
	{ name: 'origin-bottom-right', detail: 'Set transform-origin to bottom right' },
	{ name: 'origin-bottom', detail: 'Set transform-origin to bottom' },
	{ name: 'origin-bottom-left', detail: 'Set transform-origin to bottom left' },
	{ name: 'origin-left', detail: 'Set transform-origin to left' },
	{ name: 'origin-top-left', detail: 'Set transform-origin to top left' },
];

const BIND_MODIFIERS: ModifierDef[] = [
	{ name: 'camel', detail: 'Convert attribute name to camelCase' },
	{ name: 'dot', detail: 'Convert dashes in attribute name to dots' },
	{ name: 'attr', detail: 'Force binding as a DOM attribute (not property)' },
];

/**
 * Language-aware "is `position` inside a tag's attribute region?".
 *
 * Alpine's bare `@`/`:` shorthand is only ever valid as an attribute name;
 * other template languages also use `@` as a body-text directive prefix
 * (e.g. Blade's `@foreach`, `@if`, `@csrf`), which only ever appear between
 * tags, never inside one — so this distinguishes the two.
 *
 * Both families walk the whole document once and cache the resulting tag
 * ranges, but they find them differently, because `<` means different things
 * in the two: see the header comments in htmlContext.ts and jsxContext.ts.
 */
function isInsideTag(
	document: vscode.TextDocument,
	position: vscode.Position,
): boolean {
	if (isJsxLanguage(document.languageId)) {
		return isInsideJsxTagAt(document, position);
	}
	return isInsideHtmlTagAt(document, position);
}

/**
 * Detects whether the line prefix ends with an Alpine directive modifier
 * position (e.g. `x-model.`, `@click.stop.`, `x-on:keydown.enter.`).
 * Returns the directive base and already-applied modifier names.
 *
 * `insideTag` gates the bare `@`/`:` alternatives (see `isInsideTag`) — the
 * `x-`-prefixed alternatives aren't affected, since no supported template
 * language uses `x-model`/`x-on:`/`x-bind:` as its own body-text syntax. That
 * reasoning is about *template syntax* colliding with Alpine's, and it holds;
 * it is not a claim that `x-…` text outside a tag is always a directive, which
 * is the mistake the v1.7.3 diagnostic fix corrects.
 */
function detectModifierContext(
	linePrefix: string,
	insideTag: boolean,
): { directive: string; applied: string[] } | null {
	const m =
		/(x-model|x-transition|x-on:[\w:-]+|x-bind:[\w:-]+|@[\w:-]+|(?<![\w-]):[\w:-]+)((?:\.[\w-]*)*)\.[\w-]*$/.exec(
			linePrefix,
		);
	if (!m) { return null; }
	const directive = m[1];
	if ((directive.startsWith('@') || directive.startsWith(':')) && !insideTag) {
		return null;
	}
	return {
		directive,
		applied: m[2].split('.').filter(Boolean),
	};
}

/**
 * Resolves an attribute token to its documented directive, most specific
 * match first.
 *
 * Alpine has three shapes to get through: dot modifiers (`x-transition.opacity`),
 * colon arguments that are themselves documented (`x-transition:enter`, part of
 * the class-based transition API), and colon arguments that are not
 * (`x-on:click`, where the docs live on `x-on`). Stripping the colon
 * unconditionally would lose the first kind; not stripping it would lose the
 * last, which is by far the most common. So try the full name, then fall back
 * to the part before the colon.
 */
function resolveDirective(
	attrMap: Map<string, AlpineAttr>,
	token: string,
): AlpineAttr | undefined {
	const withoutModifiers = token.split('.')[0];
	return (
		attrMap.get(withoutModifiers) ??
		attrMap.get(withoutModifiers.split(':')[0])
	);
}

// ─── Hover helper ─────────────────────────────────────────────────────────────

function buildHover(
	attr: AlpineAttr,
	range: vscode.Range,
	preamble?: string,
): vscode.Hover {
	const md = new vscode.MarkdownString('', true);
	md.isTrusted = true;
	if (preamble) {
		md.appendMarkdown(`${preamble}\n\n---\n\n`);
	}
	md.appendMarkdown(
		`**\`${attr.name}\`** — Alpine.js directive\n\n${attr.description}`,
	);
	for (const ref of attr.references) {
		md.appendMarkdown(`\n\n[${ref.name}](${ref.url})`);
	}
	return new vscode.Hover(md, range);
}

// ─── activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
	console.log('Alpine.js Tools is now active!');

	// Load Alpine directive metadata from the bundled custom data file
	const dataPath = context.asAbsolutePath(
		path.join('customData', 'alpine.html-data.json'),
	);
	const alpineData: { globalAttributes: AlpineAttr[] } = JSON.parse(
		fs.readFileSync(dataPath, 'utf8'),
	);
	const attrMap = new Map(alpineData.globalAttributes.map(a => [a.name, a]));

	// Snippet bodies, shared with the `contributes.snippets` registration that
	// serves the HTML-family languages. JSX can't use that mechanism (see
	// attributeCompletionProvider.ts), so it reads the same file and serves the
	// snippets through a context-gated completion provider instead.
	const snippetPath = context.asAbsolutePath(
		path.join('snippets', 'alpine.code-snippets'),
	);
	const alpineSnippets = JSON.parse(fs.readFileSync(snippetPath, 'utf8'));

	// Kick off workspace scan (non-blocking — results fill the cache async)
	void initWorkspaceScanner(context);

	// ── Rescan command ────────────────────────────────────────────────────────
	// The watcher covers edits made inside VS Code, so this is for what it
	// can't see: exclusions configured after a scan truncated, a branch
	// switched outside the editor, or a workspace still indexing when the
	// first sweep ran. Reports the outcome either way — a rescan that silently
	// does nothing is indistinguishable from one that failed.
	context.subscriptions.push(
		vscode.commands.registerCommand('alpinejsTools.rescanWorkspace', async () => {
			const summary = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Window,
					title: 'Alpine.js Tools: rescanning workspace…',
				},
				() => rescanWorkspace(),
			);

			const components = getAlpineDataNames().length;
			const stores = getAlpineStoreNames().length;
			const found =
				`${components} Alpine.data component${components !== 1 ? 's' : ''}, ` +
				`${stores} store${stores !== 1 ? 's' : ''}`;

			if (summary.truncated.length > 0) {
				const openLog = 'Show Details';
				const choice = await vscode.window.showWarningMessage(
					`Alpine.js Tools: rescan finished (${found}), but the file limit ` +
					`was reached for ${summary.truncated.join(', ')} — some ` +
					'registrations are missing.',
					openLog,
				);
				if (choice === openLog) { getOutputChannel()?.show(true); }
			} else {
				vscode.window.showInformationMessage(
					`Alpine.js Tools: rescanned ${summary.fileCount} files — ${found}.`,
				);
			}
		}),
	);

	// ── 0. Diagnostics — unknown Alpine directives ─────────────────────────────
	createAlpineDiagnosticProvider(context);

	// ── 1. Hover — directives and magic properties ─────────────────────────────
	const hoverProvider = vscode.languages.registerHoverProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideHover(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.Hover | undefined {
				// In JSX the rest of the document is JavaScript, where `$store`
				// and the string `"x-data"` are perfectly ordinary tokens. Only
				// answer inside a JSX opening tag, where they can only be
				// Alpine.
				if (
					isJsxLanguage(document.languageId) &&
					!isInsideJsxTagAt(document, position)
				) {
					return undefined;
				}

				// $magic hover — $el, $refs, $store, $watch, etc.
				const magicRange = document.getWordRangeAtPosition(
					position,
					/\$[\w]+/,
				);
				if (magicRange) {
					const magicName = document.getText(magicRange);
					const magic = MAGIC_MAP.get(magicName);
					if (magic) {
						const md = new vscode.MarkdownString(magic.doc, true);
						md.isTrusted = true;
						return new vscode.Hover(md, magicRange);
					}
				}

				// x-* directive. The `:` in the character class lets
				// `x-transition:enter` resolve to its own documentation rather
				// than falling back to `x-transition`; `resolveDirective`
				// handles the fallback for arguments that aren't separately
				// documented, like `x-on:click`.
				const xRange = document.getWordRangeAtPosition(
					position,
					/x-[\w.:-]+/,
				);
				if (xRange) {
					const attr = resolveDirective(attrMap, document.getText(xRange));
					if (attr) { return buildHover(attr, xRange); }
				}

				// The `@event` and `:attr` shorthands below don't exist in JSX —
				// they're syntax errors there (TS1003 / TS1382), so a `@` or `:`
				// in a `.tsx` file is always something else (a decorator, a type
				// annotation, an object literal key).
				if (isJsxLanguage(document.languageId)) { return undefined; }

				// @ shorthand — show x-on docs with context note. Alpine's `@`
				// shorthand is only ever a valid attribute name, so this is
				// gated on actually being inside a tag's angle brackets —
				// otherwise body-text `@` directives from other template
				// languages (e.g. Blade's `@foreach`, `@if`, `@csrf`) are
				// mistaken for it.
				const atRange = document.getWordRangeAtPosition(
					position,
					/@[\w.-]+/,
				);
				if (atRange && isInsideHtmlTagAt(document, atRange.start)) {
					const attr = attrMap.get('x-on');
					if (attr) {
						const eventName = document.getText(atRange).slice(1).split('.')[0];
						return buildHover(
							attr,
							atRange,
							`\`@${eventName}\` is shorthand for \`x-on:${eventName}\``,
						);
					}
				}

				// : shorthand — show x-bind docs with context note.
				// The colon must not be immediately preceded by an identifier
				// character, otherwise attributes like `wire:model` (colon is
				// part of a Livewire attribute name, not the start of one) would
				// be mistaken for Alpine's `:model` shorthand. Also gated on
				// being inside a tag's angle brackets, for the same reason as
				// the `@` shorthand above.
				const colonRange = document.getWordRangeAtPosition(
					position,
					/(?<![\w-]):[\w.-]+/,
				);
				if (colonRange && isInsideHtmlTagAt(document, colonRange.start)) {
					const attr = attrMap.get('x-bind');
					if (attr) {
						const propName = document
							.getText(colonRange)
							.slice(1)
							.split('.')[0];
						return buildHover(
							attr,
							colonRange,
							`\`:${propName}\` is shorthand for \`x-bind:${propName}\``,
						);
					}
				}

				return undefined;
			},
		},
	);
	context.subscriptions.push(hoverProvider);

	// ── 2. Magic property completions (triggered by $) ────────────────────────
	const magicCompletionProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);
				const match = /\$\w*$/.exec(linePrefix);
				if (!match) { return undefined; }

				// `$` is ordinary JavaScript — an identifier character, a
				// jQuery-style binding, a template-literal interpolation. In
				// JSX, only offer the magics where they actually mean
				// something: inside an Alpine directive's value.
				if (
					isJsxLanguage(document.languageId) &&
					!JSX_DIRECTIVE_VALUE_RE.test(linePrefix)
				) {
					return undefined;
				}

				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, match.index),
					position,
				);

				return ALPINE_MAGICS.map(magic => {
					const item = new vscode.CompletionItem(
						magic.label,
						vscode.CompletionItemKind.Property,
					);
					item.range = replaceRange;
					item.detail = magic.detail;
					item.insertText = new vscode.SnippetString(magic.insert);
					const docMd = new vscode.MarkdownString(magic.doc, true);
					docMd.isTrusted = true;
					item.documentation = docMd;
					return item;
				});
			},
		},
		'$',
	);
	context.subscriptions.push(magicCompletionProvider);

	// ── 3. Dot-triggered completions: modifiers + $refs.name + $store.name ────
	const dotCompletionProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);

				// Everything this provider offers is only meaningful inside a
				// JSX opening tag; `.` is otherwise just property access.
				const isJsx = isJsxLanguage(document.languageId);
				if (isJsx && !isInsideTag(document, position)) { return undefined; }

				// $refs.name — x-ref names from current document
				const refsM = /\$refs\.(\w*)$/.exec(linePrefix);
				if (refsM) {
					const startCol = position.character - refsM[1].length;
					const replaceRange = new vscode.Range(
						new vscode.Position(position.line, startCol),
						position,
					);
					const names = getXRefNames(document.getText());
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Field,
						);
						item.range = replaceRange;
						item.detail = 'x-ref';
						item.documentation = new vscode.MarkdownString(
							`DOM element registered with \`x-ref="${name}"\``,
						);
						return item;
					});
				}

				// $store.name — Alpine.store names from workspace
				const storeM = /\$store\.(\w*)$/.exec(linePrefix);
				if (storeM) {
					const startCol = position.character - storeM[1].length;
					const replaceRange = new vscode.Range(
						new vscode.Position(position.line, startCol),
						position,
					);
					const names = getAlpineStoreNames();
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Module,
						);
						item.range = replaceRange;
						item.detail = 'Alpine.store';
						item.documentation = new vscode.MarkdownString(
							`Global store registered with \`Alpine.store('${name}', ...)\``,
						);
						return item;
					});
				}

				// Modifier completions inside Alpine directive attribute names.
				// JSX passes `insideTag: false` so that `detectModifierContext`
				// rejects its bare `@`/`:` alternatives — those aren't valid
				// JSX attribute names at all. The `x-on:`/`x-bind:`/`x-model`
				// alternatives are unaffected by the flag and still match.
				const modCtx = detectModifierContext(
					linePrefix,
					isJsx ? false : isInsideTag(document, position),
				);
				if (!modCtx) { return undefined; }

				const { directive, applied } = modCtx;
				let modifiers: ModifierDef[];
				if (directive === 'x-model') {
					modifiers = MODEL_MODIFIERS;
				} else if (directive === 'x-transition') {
					modifiers = TRANSITION_MODIFIERS;
				} else if (
					directive.startsWith('@') ||
					directive.startsWith('x-on:')
				) {
					modifiers = EVENT_MODIFIERS;
				} else if (
					directive.startsWith(':') ||
					directive.startsWith('x-bind:')
				) {
					modifiers = BIND_MODIFIERS;
				} else {
					return undefined;
				}

				// Replace the token being typed after the last dot
				const lastDot = linePrefix.lastIndexOf('.');
				const afterLastDot = linePrefix.slice(lastDot + 1);
				const startCol = position.character - afterLastDot.length;
				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, startCol),
					position,
				);

				return modifiers
					.filter(mod => !applied.includes(mod.name))
					.map(mod => {
						const item = new vscode.CompletionItem(
							mod.name,
							vscode.CompletionItemKind.EnumMember,
						);
						item.range = replaceRange;
						item.detail = 'Alpine modifier';
						item.documentation = new vscode.MarkdownString(mod.detail);
						return item;
					});
			},
		},
		'.',
	);
	context.subscriptions.push(dotCompletionProvider);

	// ── 4. Directive value completions ────────────────────────────────────────
	// In x-data="…": offers Alpine.data component names from the workspace.
	// In other Alpine directives: offers reactive property names from the
	// nearest x-data object literal in the current document.
	const directiveValueProvider = vscode.languages.registerCompletionItemProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideCompletionItems(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.CompletionItem[] | undefined {
				const linePrefix = document
					.lineAt(position)
					.text.slice(0, position.character);

				// Must be inside a quoted Alpine attribute value. The bare `:`
				// alternative requires a non-identifier character before the
				// colon so that framework attributes like `wire:model` (colon
				// mid-name, not shorthand for `x-bind:model`) aren't matched.
				//
				// JSX uses its own pattern: no `@`/`:` shorthands (syntax
				// errors there), plus support for the expression-container
				// form `x-text={"…"}` alongside the plain string form.
				const directiveM = isJsxLanguage(document.languageId)
					? JSX_DIRECTIVE_VALUE_RE.exec(linePrefix)
					: /(x-[\w-]+(?::\w+)?|@[\w:-]+|(?<![\w-]):[\w:-]+)\s*=\s*(["'])([^"']*)$/.exec(
						linePrefix,
					);
				if (!directiveM) { return undefined; }

				const directiveName = directiveM[1];
				const typedValue = directiveM[3];
				const startCol = position.character - typedValue.length;
				const replaceRange = new vscode.Range(
					new vscode.Position(position.line, startCol),
					position,
				);

				// x-data="…" — offer Alpine.data component names
				if (directiveName === 'x-data') {
					const names = getAlpineDataNames();
					if (names.length === 0) { return undefined; }
					return names.map(name => {
						const item = new vscode.CompletionItem(
							name,
							vscode.CompletionItemKind.Function,
						);
						item.range = replaceRange;
						item.detail = 'Alpine.data component';
						item.documentation = new vscode.MarkdownString(
							`References \`Alpine.data('${name}', ...)\` component.`,
						);
						return item;
					});
				}

				// Other directives — offer x-data property names
				const text = document.getText();
				const offset = document.offsetAt(position);
				const props = getXDataProps(text, offset);
				if (props.length === 0) { return undefined; }

				return props.map(prop => {
					const item = new vscode.CompletionItem(
						prop,
						vscode.CompletionItemKind.Property,
					);
					item.range = replaceRange;
					item.detail = 'x-data property';
					return item;
				});
			},
		},
		// No explicit trigger — fires automatically in attribute value context
	);
	context.subscriptions.push(directiveValueProvider);

	// ── 4b. Directive-name + snippet completions served by a provider ─────────
	// Most HTML-family languages get these from `contributes.html/customData`
	// and `contributes.snippets`; neither reaches a `.jsx`/`.tsx` document, and
	// neither reaches Astro or the Go family either. Those need a provider so
	// the items can be gated on being inside a tag rather than offered in the
	// middle of TypeScript, Go or YAML — see attributeCompletionProvider.ts.
	createAttributeCompletionProvider(context, alpineData.globalAttributes, alpineSnippets, {
		languages: JSX_LANGUAGES,
		isInsideTag: isInsideJsxTagAt,
		rewriteBody: toJsxSnippetBody,
	});
	createAttributeCompletionProvider(context, alpineData.globalAttributes, alpineSnippets, {
		languages: PROVIDER_SNIPPET_LANGUAGES,
		isInsideTag: isInsideHtmlTagAt,
		rewriteBody: toMarkupSnippetBody,
	});

	// ── 5. Code actions — quick fix for unknown directives ────────────────────
	createAlpineCodeActionProvider(context);

	// ── 6. Definition — x-data="componentName" → Alpine.data('componentName')
	const definitionProvider = vscode.languages.registerDefinitionProvider(
		ALPINE_LANGUAGES.map(lang => ({ language: lang })),
		{
			provideDefinition(
				document: vscode.TextDocument,
				position: vscode.Position,
			): vscode.Location[] | undefined {
				const line = document.lineAt(position).text;
				const col = position.character;

				// Match x-data="value", x-data='value', or JSX's
				// x-data={"value"} on the current line
				const xDataRe = /x-data=\{?\s*(["'])([^"']*)\1/g;
				let m: RegExpExecArray | null;
				while ((m = xDataRe.exec(line)) !== null) {
					// Only trigger when the cursor is inside the quoted value portion,
					// not on the attribute name itself.
					// m[0] = 'x-data="value"', m[1] = quote char, m[2] = value
					const valueStart = m.index + m[0].indexOf(m[1]) + 1; // after opening quote
					const valueEnd = valueStart + m[2].length;           // before closing quote
					if (col < valueStart || col > valueEnd) { continue; }

					const value = m[2].trim();
					// Only trigger for plain component name references,
					// not inline object literals or expressions.
					if (!value || value.startsWith('{') || value.includes('(')) {
						return undefined;
					}

					const locs = getAlpineDataLocations(value);
					return locs.length ? locs : undefined;
				}
				return undefined;
			},
		},
	);
	context.subscriptions.push(definitionProvider);
}

export function deactivate(): void {
	// Subscriptions disposed automatically
}
