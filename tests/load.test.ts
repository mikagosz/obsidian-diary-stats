/**
 * What comes in from outside the plugin: data.json of any shape, day notes with
 * a date that does not exist, and a goals section far longer than anyone writes.
 */

import { describe, expect, it } from 'vitest';
import { isRealDate, parseGoals } from '../src/model';
import { DEFAULT_SETTINGS, settingsFrom } from '../src/settings';

describe('settingsFrom', () => {
	it('keeps fields of the right kind and trims names', () => {
		const s = settingsFrom({ diaryFolder: ' Dziennik ', maxProjects: 3, projectNames: 'A\nB' });
		expect(s.diaryFolder).toBe('Dziennik');
		expect(s.maxProjects).toBe(3);
		expect(s.projectNames).toBe('A\nB');
	});

	it('falls back to the default for a field of the wrong kind', () => {
		const s = settingsFrom({
			diaryFolder: 5,
			sessionFolder: null,
			projectNames: 5,
			auditPrefix: null,
			maxProjects: 'x',
		});
		expect(s).toEqual(DEFAULT_SETTINGS);
	});

	it('treats an empty or blank folder as not set', () => {
		expect(settingsFrom({ diaryFolder: '' }).diaryFolder).toBe(DEFAULT_SETTINGS.diaryFolder);
		expect(settingsFrom({ diaryFolder: '   ' }).diaryFolder).toBe(DEFAULT_SETTINGS.diaryFolder);
	});

	it('survives a file that is not an object', () => {
		for (const stored of [null, undefined, [], 'abc', 5]) {
			expect(settingsFrom(stored)).toEqual(DEFAULT_SETTINGS);
		}
	});

	it('rejects a number that is not finite', () => {
		expect(settingsFrom({ maxProjects: Number.NaN }).maxProjects).toBe(
			DEFAULT_SETTINGS.maxProjects,
		);
	});
});

describe('isRealDate', () => {
	it('accepts days that exist and refuses the rest', () => {
		expect(isRealDate('2026-02-28')).toBe(true);
		expect(isRealDate('2028-02-29')).toBe(true);
		for (const bad of ['2026-02-30', '2026-13-45', '2026-00-10', '2026-02-29']) {
			expect(isRealDate(bad)).toBe(false);
		}
	});
});

describe('parseGoals on a very long section', () => {
	it('counts 500 000 checkboxes without overflowing the stack', () => {
		const lines = Array.from({ length: 500_000 }, (_, i) => `- [${i % 2 ? 'x' : ' '}] c${i}`);
		expect(parseGoals(lines)).toHaveLength(500_000);
	});
});
