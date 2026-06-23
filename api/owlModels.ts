export const OWL_PROMPT =	`
	Edit this image: it is a rough sketch of an owl
	It has eyes, a beak, feet, and feather marks already roughed in - possibly a branch it's standing on. 
	Draw the rest of the owl as a professional and cohesive graphite pencil sketch. 
	KEEP THE POSE AND PROPORTIONS, which may be abnormal and unreal. 
	Plain white background, turn this sketch into a skillful artistic result.
    STICK TO THE GUIDE MARKS, with beautiful feathers, talons, eyes, beak.`;

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

export const OWL_MODELS: OwlModelConfig[] = [OWL_MODEL];

export function getOwlModel(modelId: string): OwlModelConfig | undefined {
	return OWL_MODELS.find((m) => m.id === modelId);
}
