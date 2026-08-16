import {
	type App,
	debounce,
	PluginSettingTab,
	Setting,
	type SettingDefinitionBase,
	type SettingDefinitionItem,
	type SettingSliderControl,
	type SettingTextAreaControl,
	type SettingTextControl,
} from 'obsidian';
import type DiaryStatsPlugin from './main';

export interface DiaryStatsSettings {
	diaryFolder: string;
	sessionFolder: string;
	goalsHeading: string;
	/** Projects beyond this many fold into one "rest" slice. */
	maxProjects: number;
	/**
	 * Preferred spellings of project names, one per line. Every variant of a name
	 * listed here folds onto it. Empty by default: without it each note is taken
	 * at its word, which is right until two spellings of one project show up.
	 */
	projectNames: string;
}

export const DEFAULT_SETTINGS: DiaryStatsSettings = {
	diaryFolder: '_Dziennik',
	sessionFolder: '_Sesje',
	goalsHeading: 'Cele',
	maxProjects: 7,
	projectNames: '',
};

/** Splits the setting into names; blank lines are ignored. */
export function projectNameList(raw: string): string[] {
	return raw
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

type SettingKey = keyof DiaryStatsSettings;

/** Only the three control kinds this plugin actually uses. */
type DiaryStatsControl =
	| SettingTextControl<SettingKey>
	| SettingTextAreaControl<SettingKey>
	| SettingSliderControl<SettingKey>;

interface DiaryStatsDefinition extends SettingDefinitionBase {
	control: DiaryStatsControl;
}

export class DiaryStatsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: DiaryStatsPlugin,
	) {
		super(app, plugin);
	}

	/**
	 * The single source of truth for this tab. Obsidian 1.13.0+ renders these
	 * definitions itself and indexes them for the settings search; older versions
	 * never call `getSettingDefinitions`, so `display` below walks the same list.
	 * One list means the two paths cannot drift apart.
	 */
	private definitions(): DiaryStatsDefinition[] {
		return [
			{
				name: 'Diary folder',
				desc: 'Folder holding the day notes. Their filenames must start with a date, as in 2026-08-09.',
				aliases: ['diary', 'journal', 'days'],
				control: {
					type: 'text',
					key: 'diaryFolder',
					placeholder: DEFAULT_SETTINGS.diaryFolder,
					defaultValue: DEFAULT_SETTINGS.diaryFolder,
				},
			},
			{
				name: 'Session log folder',
				desc: 'Where the notes linked from each day live. Their frontmatter supplies the project breakdown.',
				aliases: ['sessions', 'logs'],
				control: {
					type: 'text',
					key: 'sessionFolder',
					placeholder: DEFAULT_SETTINGS.sessionFolder,
					defaultValue: DEFAULT_SETTINGS.sessionFolder,
				},
			},
			{
				name: 'Goals heading',
				desc: 'Heading whose list items are read as goals, written as `Name :: plan / actual`. Leave the section out and the goals panel simply does not appear.',
				aliases: ['goals', 'targets'],
				control: {
					type: 'text',
					key: 'goalsHeading',
					placeholder: DEFAULT_SETTINGS.goalsHeading,
					defaultValue: DEFAULT_SETTINGS.goalsHeading,
				},
			},
			{
				name: 'Project names',
				desc: 'One preferred spelling per line. Every variant of a name — case, spaces, dashes — folds onto the spelling written here, so a project never splits into two slices. Leave empty to take every note at its word.',
				aliases: ['projects', 'spelling', 'names'],
				control: {
					type: 'textarea',
					key: 'projectNames',
					rows: 6,
					defaultValue: DEFAULT_SETTINGS.projectNames,
				},
			},
			{
				name: 'Projects shown separately',
				desc: 'Everything past this count is folded into one slice. Above eight the colours stop being reliably distinguishable.',
				aliases: ['slices', 'donut', 'colours'],
				control: {
					type: 'slider',
					key: 'maxProjects',
					min: 3,
					max: 8,
					step: 1,
					defaultValue: DEFAULT_SETTINGS.maxProjects,
				},
			},
		];
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.definitions();
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as SettingKey];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
	}

	/**
	 * Fallback for Obsidian older than 1.13.0, which renders setting tabs
	 * imperatively. Deliberately reads from the same `definitions()` list.
	 */
	display(): void {
		this.containerEl.empty();

		for (const definition of this.definitions()) {
			const setting = new Setting(this.containerEl).setName(definition.name);
			if (typeof definition.desc === 'string') setting.setDesc(definition.desc);

			const control = definition.control;
			// Typing into a field fires on every keystroke, and each one used to be a
			// write to data.json — several hundred of them while filling in the
			// multi-line project list.
			const commit = debounce(
				(value: unknown) => {
					void this.setControlValue(control.key, value);
				},
				500,
				true,
			);

			switch (control.type) {
				case 'text':
					setting.addText((text) =>
						text
							.setPlaceholder(control.placeholder ?? '')
							.setValue(this.getControlValue(control.key) as string)
							.onChange((value) => {
								// An emptied folder field must not leave the plugin looking
								// at the vault root.
								commit(value.trim() || (control.defaultValue ?? ''));
							}),
					);
					break;
				case 'textarea':
					setting.addTextArea((text) => {
						text.inputEl.rows = control.rows ?? 4;
						text.setValue(this.getControlValue(control.key) as string).onChange(commit);
					});
					break;
				case 'slider':
					setting.addSlider((slider) =>
						slider
							.setLimits(control.min, control.max, control.step)
							.setValue(this.getControlValue(control.key) as number)
							.onChange(commit),
					);
					break;
			}
		}
	}
}
