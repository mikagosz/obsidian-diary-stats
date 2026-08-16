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
