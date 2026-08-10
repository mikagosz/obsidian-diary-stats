import { type App, PluginSettingTab, Setting } from "obsidian";
import type DiaryStatsPlugin from "./main";

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
	diaryFolder: "_Dziennik",
	sessionFolder: "_Sesje",
	goalsHeading: "Cele",
	maxProjects: 7,
	projectNames: "",
};

/** Splits the setting into names; blank lines are ignored. */
export function projectNameList(raw: string): string[] {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

export class DiaryStatsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: DiaryStatsPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Diary folder")
			.setDesc("Folder holding the day notes. Their filenames must start with a date, as in 2026-08-09.")
			.addText((text) =>
				text.setValue(this.plugin.settings.diaryFolder).onChange(async (value) => {
					this.plugin.settings.diaryFolder = value.trim() || DEFAULT_SETTINGS.diaryFolder;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(this.containerEl)
			.setName("Session log folder")
			.setDesc("Where the notes linked from each day live. Their frontmatter supplies the project breakdown.")
			.addText((text) =>
				text.setValue(this.plugin.settings.sessionFolder).onChange(async (value) => {
					this.plugin.settings.sessionFolder = value.trim() || DEFAULT_SETTINGS.sessionFolder;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(this.containerEl)
			.setName("Goals heading")
			.setDesc(
				"Heading whose list items are read as goals, written as `Name :: plan / actual`. Leave the section out and the goals panel simply does not appear.",
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.goalsHeading).onChange(async (value) => {
					this.plugin.settings.goalsHeading = value.trim() || DEFAULT_SETTINGS.goalsHeading;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(this.containerEl)
			.setName("Project names")
			.setDesc(
				"One preferred spelling per line. Every variant of a name — case, spaces, dashes — folds onto the spelling written here, so a project never splits into two slices. Leave empty to take every note at its word.",
			)
			.addTextArea((text) => {
				text.inputEl.rows = 6;
				text.setValue(this.plugin.settings.projectNames);
				text.onChange(async (value) => {
					this.plugin.settings.projectNames = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Projects shown separately")
			.setDesc("Everything past this count is folded into one slice. Above eight the colours stop being reliably distinguishable.")
			.addSlider((slider) =>
				slider
					.setLimits(3, 8, 1)
					.setValue(this.plugin.settings.maxProjects)
					.onChange(async (value) => {
						this.plugin.settings.maxProjects = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
