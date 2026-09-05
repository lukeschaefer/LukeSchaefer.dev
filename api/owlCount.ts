const OWL_COUNT_KEY = "owls:drawn";
const LOCAL_START_COUNT = 50;

let localCount = LOCAL_START_COUNT;

type KvConfig = { url: string; token: string };

function getKvConfig(): KvConfig | null {
	const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
	return url && token ? { url, token } : null;
}

async function kvCommand(config: KvConfig, command: "get" | "incr"): Promise<number> {
	const response = await fetch(`${config.url}/${command}/${OWL_COUNT_KEY}`, {
		headers: { Authorization: `Bearer ${config.token}` },
	});
	if (!response.ok) {
		throw new Error(`KV ${command} failed (${response.status}).`);
	}

	const data = (await response.json()) as { result?: number | string | null };
	const result = Number(data.result ?? 0);
	return Number.isFinite(result) ? result : 0;
}

export async function getOwlCount(): Promise<number | null> {
	const config = getKvConfig();
	if (!config) return localCount;

	try {
		return await kvCommand(config, "get");
	} catch (error) {
		console.error("[owlCount] get failed:", error);
		return null;
	}
}

export async function incrementOwlCount(): Promise<number | null> {
	const config = getKvConfig();
	if (!config) {
		localCount += 1;
		return localCount;
	}

	try {
		return await kvCommand(config, "incr");
	} catch (error) {
		console.error("[owlCount] incr failed:", error);
		return null;
	}
}
