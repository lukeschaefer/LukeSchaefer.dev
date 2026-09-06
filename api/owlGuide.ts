import { createRequire } from "node:module";
import path from "node:path";
import { OWL_CANVAS_SIZE } from "./owlCircles";
import { pencilfyOwl, type OwlCircle, type PencilCanvas } from "../src/utils/pencilfyOwl";

const { Path2D, createCanvas } = createRequire(path.join(process.cwd(), "package.json"))(
	"@napi-rs/canvas",
) as typeof import("@napi-rs/canvas");

export async function renderOwlGuideDataUrl(circles: OwlCircle[]): Promise<string> {
	(globalThis as unknown as { Path2D: typeof Path2D }).Path2D = Path2D;

	const canvas = createCanvas(OWL_CANVAS_SIZE, OWL_CANVAS_SIZE);
	pencilfyOwl(canvas as unknown as PencilCanvas, circles, { background: "#ffffff" });
	return canvas.toDataURL("image/png");
}
