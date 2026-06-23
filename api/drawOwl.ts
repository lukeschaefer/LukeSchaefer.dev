import { callOpenRouterImageEdit } from "./openrouterImage";
import { getOwlModel, OWL_MODELS, OWL_PROMPT } from "./owlModels";

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
	return Response.json(
		{ error: "Failed to draw the owl", message, ...extra },
		{ status, headers: { "Cache-Control": "no-store" } },
	);
}

export async function GET(): Promise<Response> {
	return Response.json(
		{
			models: OWL_MODELS.map((m) => ({
				id: m.id,
				settings: m.settingsLabel,
			})),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}

export async function POST(request: Request): Promise<Response> {
	let body: { image?: unknown; model?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON body.", 400);
	}

	const { image, model } = body;
	if (typeof image !== "string" || !image.startsWith("data:image/")) {
		return jsonError("Expected an `image` data URL in the request body.", 400);
	}
	if (typeof model !== "string") {
		return jsonError("Expected a `model` string in the request body.", 400);
	}

	const config = getOwlModel(model);
	if (!config) {
		return jsonError(`Unknown model: ${model}`, 400, { model });
	}

	try {
		const result = await callOpenRouterImageEdit({
			logLabel: `drawOwl:${model}`,
			model: config.id,
			prompt: OWL_PROMPT,
			image,
			modalities: config.modalities,
			imageConfig: config.imageConfig,
		});

		return Response.json(
			{
				model: config.id,
				image: result.image,
				latencyMs: result.latencyMs,
				cost: result.cost,
				settings: config.settingsLabel,
				usage: result.usage,
			},
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			return jsonError("Image generation timed out.", 504, { model });
		}

		console.error(`[drawOwl:${model}] unexpected error:`, error);
		return jsonError(error instanceof Error ? error.message : "Unknown error", 500, {
			model,
		});
	}
}
