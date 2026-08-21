import { defineConfig } from '@vscode/test-cli';

/**
 * Companion extensions that register the template language IDs this extension
 * provides for. Without them the test host has no `ejs`/`twig`/`nunjucks`/
 * `blade`/`liquid`/`jinja-html` language, every such document opens as
 * `plaintext`, and no provider is registered for it — so the positive tests
 * fail and, worse, the negative ones ("no Alpine hover appears here") pass
 * vacuously, because nothing appears anywhere.
 *
 * Each ID was verified against its published marketplace manifest to confirm
 * it contributes the exact language ID used in src/constants.ts.
 * `html`, `php`, `javascript`, `javascriptreact` and `typescriptreact` are
 * built into VS Code and need nothing here. Hugo needs nothing either: its
 * extension contributes the `html` language ID rather than one of its own.
 *
 * `casualjim.gotemplate` also claims the `.html` and `.css` file extensions
 * for its own languages. That doesn't reach these tests, which open untitled
 * documents with an explicit language ID rather than files, but it is the
 * reason `gohtml` support matters — see src/constants.ts.
 */
const LANGUAGE_EXTENSIONS = [
	'DigitalBrainstem.javascript-ejs-support', // ejs
	'whatwedo.twig',                           // twig
	'ronnidc.nunjucks',                        // nunjucks
	'onecentlin.laravel-blade',                // blade
	'sissel.shopify-liquid',                   // liquid
	'samuelcolvin.jinjahtml',                  // jinja-html
	'astro-build.astro-vscode',                // astro
	'a-h.templ',                               // templ
	'casualjim.gotemplate',                    // gohtml, gotemplate
	'jinliming2.vscode-go-template',           // go-template
];

export default defineConfig({
	files: 'out/test/**/*.test.js',
	installExtensions: LANGUAGE_EXTENSIONS,
});
