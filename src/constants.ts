export const ALPINE_LANGUAGES = [
	'html', 'ejs', 'php', 'twig', 'nunjucks', 'blade', 'liquid', 'jinja-html',
] as const;

export type AlpineLanguage = typeof ALPINE_LANGUAGES[number];

export const ALPINE_LANGUAGES_SET = new Set<string>(ALPINE_LANGUAGES);
