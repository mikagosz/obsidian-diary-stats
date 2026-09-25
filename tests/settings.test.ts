/**
 * The settings tab's write path. Obsidian 1.13.0+ builds the controls itself
 * and calls `setControlValue` on every keystroke, never `display` — so the
 * debounce and the empty-folder guard have to hold there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type DiaryStatsPlugin from '../src/main';
import { DEFAULT_SETTINGS, DiaryStatsSettingTab, storedValue } from '../src/settings';

function tab() {
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		saveSettings: vi.fn(async () => {}),
	};
	const settingTab = new DiaryStatsSettingTab({} as never, plugin as unknown as DiaryStatsPlugin);
	return { plugin, settingTab };
}

describe('storedValue', () => {
	it('puts the default back when a folder or heading field is emptied', () => {
		expect(storedValue('diaryFolder', '')).toBe('_Dziennik');
		expect(storedValue('sessionFolder', '   ')).toBe('_Sesje');
		expect(storedValue('goalsHeading', '')).toBe('Cele');
	});

	it('trims a folder name', () => {
		expect(storedValue('diaryFolder', '  Journal ')).toBe('Journal');
	});

	it('leaves the project list and the slider alone', () => {
		expect(storedValue('projectNames', '')).toBe('');
		expect(storedValue('projectNames', ' A\nB ')).toBe(' A\nB ');
		expect(storedValue('maxProjects', 5)).toBe(5);
	});
});

describe('setControlValue', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('never stores an empty diary folder', async () => {
		const { plugin, settingTab } = tab();
		await settingTab.setControlValue('diaryFolder', '');
		expect(plugin.settings.diaryFolder).toBe('_Dziennik');
	});

	it('writes data.json once for a burst of keystrokes, with the last value', async () => {
		const { plugin, settingTab } = tab();
		for (const typed of ['A', 'Al', 'Alf', 'Alfa']) {
			await settingTab.setControlValue('projectNames', typed);
		}
		expect(plugin.settings.projectNames).toBe('Alfa');
		expect(plugin.saveSettings).not.toHaveBeenCalled();
		vi.advanceTimersByTime(600);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it('writes what is still waiting when the settings close', async () => {
		const { plugin, settingTab } = tab();
		await settingTab.setControlValue('goalsHeading', 'Plany');
		settingTab.hide();
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(600);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});
});
