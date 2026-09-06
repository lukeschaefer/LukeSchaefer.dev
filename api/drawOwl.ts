import fs from "node:fs";
import path from "node:path";
import { CircleRequestError, circlesMatchDefault, parseRequestCircles } from "./owlCircles";
import { renderOwlGuideDataUrl } from "./owlGuide";
import { OWL_MODEL, OWL_PROMPT } from "./owlModels";
import { callOpenRouterImageEdit } from "./openrouterImage";
import { getOwlCount, incrementOwlCount } from "./owlCount";

const PRESET_OWL_FILES = ["owl1.png", "owl2.png", "owl3.png"] as const;
const PRESET_DELAY_MS = 2000;

function jsonError(message: string, status: number) {
	return Response.json(
		{ error: "Failed to draw the owl", message },
		{ status, headers: { "Cache-Control": "no-store" } },
	);
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readPresetOwlDataUrl(): string {
	const file = PRESET_OWL_FILES[Math.floor(Math.random() * PRESET_OWL_FILES.length)]!;
	const bytes = fs.readFileSync(path.join(process.cwd(), "public", file));
	return `data:image/png;base64,${bytes.toString("base64")}`;
}

export async function GET(): Promise<Response> {
	return Response.json(
		{ owls: await getOwlCount() },
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export async function POST(request: Request): Promise<Response> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON body.", 400);
	}

	let circles;
	try {
		circles = parseRequestCircles(body);
	} catch (error) {
		if (error instanceof CircleRequestError) {
			return jsonError(error.message, 400);
		}
		throw error;
	}

	try {
		if (circlesMatchDefault(circles)) {
			await sleep(PRESET_DELAY_MS);
			const image = readPresetOwlDataUrl();
			const owls = await incrementOwlCount();
			return Response.json(
				{ image, owls },
				{ headers: { "Cache-Control": "no-store" } },
			);
		}

		const image = await renderOwlGuideDataUrl(circles);
		const result = await callOpenRouterImageEdit({
			logLabel: "drawOwl",
			model: OWL_MODEL.id,
			prompt: OWL_PROMPT,
			image,
			modalities: OWL_MODEL.modalities,
			imageConfig: OWL_MODEL.imageConfig,
			...(OWL_MODEL.chatParams ? { chatParams: OWL_MODEL.chatParams } : {}),
		});

		const owls = await incrementOwlCount();

		return Response.json(
			{ image: result.image, owls },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			return jsonError("Image generation timed out.", 504);
		}

		console.error("[drawOwl] unexpected error:", error);
		return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
	}
}
