export const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterImage = { image_url?: { url?: string } };
type OpenRouterMessage = {
	images?: OpenRouterImage[];
	content?: string | null;
};
type OpenRouterUsage = {
	cost?: number;
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
};
type OpenRouterResponse = {
	error?: { message?: string };
	choices?: { message?: OpenRouterMessage }[];
	usage?: OpenRouterUsage;
};

export type OpenRouterImageEditOptions = {
	logLabel: string;
	model: string;
	prompt: string;
	image: string;
	modalities: ("image" | "text")[];
	imageConfig?: Record<string, unknown>;
	chatParams?: {
		temperature?: number;
		top_p?: number;
		seed?: number;
	};
};

export type GenerationResult = {
	image: string;
	latencyMs: number;
	cost: number | null;
	usage: OpenRouterUsage | null;
};

function extractImageDataUrl(message: OpenRouterMessage | undefined): string | null {
	for (const img of message?.images ?? []) {
		const url = img.image_url?.url;
		if (url?.startsWith("data:image/")) return url;
	}

	const content = message?.content;
	if (typeof content === "string") {
		const match = content.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/);
		if (match) return match[0];
	}

	return null;
}

function getOpenRouterKey(): string {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) {
		throw new Error("OPENROUTER_API_KEY is not set.");
	}

	return key;
}

export async function callOpenRouterImageEdit(
	options: OpenRouterImageEditOptions,
): Promise<GenerationResult> {
	const startedAt = Date.now();
	console.log(`[${options.logLabel}] OpenRouter ${options.model}`);
	const openRouterKey = getOpenRouterKey();

	const upstream = await fetch(openRouterUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${openRouterKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://luke.zip/",
			"X-Title": "Draw the Owl",
		},
		body: JSON.stringify({
			model: options.model,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: options.prompt },
						{ type: "image_url", image_url: { url: options.image } },
					],
				},
			],
			modalities: options.modalities,
			image_config: options.imageConfig ?? { aspect_ratio: "1:1" },
			...options.chatParams,
		}),
		signal: AbortSignal.timeout(90_000),
	});

	const result = (await upstream.json()) as OpenRouterResponse;
	const latencyMs = Date.now() - startedAt;
	console.log(`[${options.logLabel}] done in ${latencyMs}ms (${upstream.status})`);

	if (!upstream.ok) {
		const message = result.error?.message ?? `OpenRouter request failed (${upstream.status}).`;
		console.error(`[${options.logLabel}] error:`, result);
		throw new Error(message);
	}

	const generated = extractImageDataUrl(result.choices?.[0]?.message);
	if (!generated) {
		console.error(`[${options.logLabel}] no image in response:`, JSON.stringify(result));
		throw new Error("OpenRouter did not return an image.");
	}

	const cost =
		typeof result.usage?.cost === "number" && Number.isFinite(result.usage.cost)
			? result.usage.cost
			: null;

	return { image: generated, latencyMs, cost, usage: result.usage ?? null };
}
