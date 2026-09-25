/**
 * Stands in for the `obsidian` package when the tests run.
 *
 * The real package ships types only — there is no runtime to import — so any
 * module that uses `TFile` or `Vault` as a *value* rather than a type cannot be
 * loaded by the test runner without this. `vitest.config.ts` aliases the module
 * name here.
 *
 * Only what the source actually touches at run time is stubbed. Anything missing
 * should fail loudly rather than quietly return undefined, so this file stays a
 * list of deliberate decisions instead of a fake Obsidian.
 */

export class TAbstractFile {
	path = '';
	name = '';
}

export class TFile extends TAbstractFile {
	basename = '';
	extension = '';
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export const Vault = {
	/** Depth-first, matching the real one closely enough for the walk under test. */
	recurseChildren(root: TFolder, cb: (file: TAbstractFile) => unknown): void {
		for (const child of root.children) {
			cb(child);
			if (child instanceof TFolder) Vault.recurseChildren(child, cb);
		}
	},
};

/** The real one's contract: with `resetTimer`, every call pushes the run back. */
export function debounce<T extends unknown[]>(
	cb: (...args: T) => unknown,
	timeout = 0,
	resetTimer = false,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: T | undefined;
	const fire = () => {
		timer = undefined;
		const args = pending as T;
		pending = undefined;
		return cb(...args);
	};
	const debounced = (...args: T) => {
		pending = args;
		if (timer !== undefined && resetTimer) clearTimeout(timer);
		if (timer === undefined || resetTimer) timer = setTimeout(fire, timeout);
		return debounced;
	};
	debounced.cancel = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		pending = undefined;
		return debounced;
	};
	debounced.run = () => {
		if (timer === undefined) return;
		clearTimeout(timer);
		return fire();
	};
	return debounced;
}

/** Enough of a settings tab to construct one; rendering is never exercised. */
export class PluginSettingTab {
	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}
	hide(): void {}
}

/** Imported by the settings tab for `display`, which the tests do not call. */
export class Setting {}
