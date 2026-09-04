import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STYLE_SAMPLE_FILES = [
	{ file: "sample_1.jpg", mime: "image/jpeg" },
	{ file: "sample_2.png", mime: "image/png" },
	{ file: "sample_3.png", mime: "image/png" },
] as const;

/** Very low style influence so the construction sketch stays in charge. */
export const STYLE_REFERENCE_STRENGTH = 0.18;

function assetsDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.join(here, "../src/assets"),
		path.join(process.cwd(), "src/assets"),
	];

	for (const dir of candidates) {
		if (fs.existsSync(path.join(dir, STYLE_SAMPLE_FILES[0].file))) return dir;
	}

	throw new Error("Could not find src/assets style samples.");
}

let cached: { url: string; strength: number }[] | null = null;

export function loadOwlStyleReferences(): { url: string; strength: number }[] {
	if (cached) return cached;

	const dir = assetsDir();
	cached = STYLE_SAMPLE_FILES.map(({ file, mime }) => {
		const bytes = fs.readFileSync(path.join(dir, file));
		return {
			url: `data:${mime};base64,${bytes.toString("base64")}`,
			strength: STYLE_REFERENCE_STRENGTH,
		};
	});

	return cached;
}
