/**
 * The vault walk behind `collectDays`.
 *
 * Worth pinning down because the walk replaced a filter over every Markdown file
 * in the vault, and the failure mode of getting it wrong is silent: days simply
 * stop appearing on the charts, with no error anywhere.
 */

import { describe, expect, it } from 'vitest';
import { collectDays, type Sources } from '../src/collect';
import { TFile, TFolder } from './obsidian-stub';

function file(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.name = path.split('/').pop() ?? path;
	f.basename = f.name.replace(/\.md$/, '');
	f.extension = path.endsWith('.md') ? 'md' : 'png';
	return f;
}

function folder(path: string, children: (TFile | TFolder)[]): TFolder {
	const f = new TFolder();
	f.path = path;
	f.name = path.split('/').pop() ?? path;
	f.children = children;
	return f;
}

/** Just enough App for the walk: a folder tree and an empty metadata cache. */
function appWith(root: TFolder | null) {
	return {
		vault: { getFolderByPath: (path: string) => (root?.path === path ? root : null) },
		metadataCache: {
			getFileCache: () => undefined,
			getFirstLinkpathDest: () => null,
		},
	} as never;
}

const sources: Sources = {
	diaryFolder: '_Dziennik',
	sessionFolder: '_Sesje',
	goalsHeading: 'Cele',
	projectNames: [],
};

const august = { from: '2026-08-01', to: '2026-08-31' };

describe('collectDays', () => {
	// The real diary nests years, then months: 2026/Dni/08 Sierpień/.
	it('reaches day notes nested several folders deep', () => {
		const tree = folder('_Dziennik', [
			folder('_Dziennik/2026', [
				folder('_Dziennik/2026/Dni', [
					folder('_Dziennik/2026/Dni/08 Sierpień', [
						file('_Dziennik/2026/Dni/08 Sierpień/2026-08-09 (niedziela).md'),
						file('_Dziennik/2026/Dni/08 Sierpień/2026-08-10 (poniedziałek).md'),
					]),
				]),
			]),
		]);

		const days = collectDays(appWith(tree), august, sources);

		expect(days.map((d) => d.date)).toEqual(['2026-08-09', '2026-08-10']);
	});

	it('sorts by date, whatever order the folders came in', () => {
		const tree = folder('_Dziennik', [
			file('_Dziennik/2026-08-20.md'),
			file('_Dziennik/2026-08-02.md'),
		]);

		expect(collectDays(appWith(tree), august, sources).map((d) => d.date)).toEqual([
			'2026-08-02',
			'2026-08-20',
		]);
	});

	it('ignores notes outside the period and files that are not dated', () => {
		const tree = folder('_Dziennik', [
			file('_Dziennik/2026-08-09.md'),
			file('_Dziennik/2026-07-31.md'),
			file('_Dziennik/O dzienniku.md'),
			file('_Dziennik/2026-08-11 zrzut.png'),
		]);

		expect(collectDays(appWith(tree), august, sources).map((d) => d.date)).toEqual(['2026-08-09']);
	});

	// A vault that keeps its diary somewhere else must not throw; an empty period
	// is the honest answer.
	it('returns nothing when the diary folder does not exist', () => {
		expect(collectDays(appWith(null), august, sources)).toEqual([]);
	});
});
