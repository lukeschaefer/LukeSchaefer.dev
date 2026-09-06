export const OWL_PROMPT = `This is a rough construction sketch, not a finished drawing.
Use it only for approximate pose, head/body placement, and facing direction.
Do not trace the guide marks, feather ticks, or construction lines.
Interpret freely: add believable anatomy, volume, and graphite shading.
The result should look like a realistic hand drawn artist sketch, inspired by the wireframe.
White background, black and white, rough charcoal sketch`;

export type OwlModelConfig = {
	id: string;
	modalities: ("image" | "text")[];
	imageConfig: Record<string, unknown>;
	settingsLabel: string;
	/** OpenRouter chat params supported by Grok Imagine (see model docs). */
	chatParams?: {
		temperature?: number;
		top_p?: number;
		seed?: number;
	};
};

export const OWL_MODEL: OwlModelConfig = {
	id: "x-ai/grok-imagine-image-quality",
	modalities: ["image"],
	imageConfig: {
		aspect_ratio: "1:1",
		image_size: "1K",
	},
	settingsLabel: "1:1, 1K",
};
