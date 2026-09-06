import { DEFAULT_OWL_BUDGET_USD, OWL_BUDGET_KV_KEY } from "./owlBudget";

const OWL_COUNT_KEY = "owls:drawn";
const LOCAL_START_COUNT = 50;

let localCount = LOCAL_START_COUNT;
let localBudget = DEFAULT_OWL_BUDGET_USD;

type KvConfig = { url: string; token: string };

function getKvConfig(): KvConfig | null {
	const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
	return url && token ? { url, token } : null;
}

async function kvFetch(config: KvConfig, path: string): Promise<unknown> {
	const response = await fetch(`${config.url}${path}`, {
		headers: { Authorization: `Bearer ${config.token}` },
	});
	if (!response.ok) {
		throw new Error(`KV ${path} failed (${response.status}).`);
	}
	return response.json();
}

function readKvNumber(data: unknown): number | null {
	const result = (data as { result?: number | string | null }).result;
	if (result == null || result === "") return null;
	const value = Number(result);
	return Number.isFinite(value) ? value : null;
}

async function kvGet(config: KvConfig, key: string): Promise<number | null> {
	return readKvNumber(await kvFetch(config, `/get/${key}`));
}

async function kvSet(config: KvConfig, key: string, value: number): Promise<void> {
	await kvFetch(config, `/set/${key}/${value}`);
}

async function kvIncr(config: KvConfig, key: string): Promise<number> {
	return readKvNumber(await kvFetch(config, `/incr/${key}`)) ?? 0;
}

export async function getOwlCount(): Promise<number | null> {
	const config = getKvConfig();
	if (!config) return localCount;

	try {
		return (await kvGet(config, OWL_COUNT_KEY)) ?? 0;
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
		return await kvIncr(config, OWL_COUNT_KEY);
	} catch (error) {
		console.error("[owlCount] incr failed:", error);
		return null;
	}
}

export async function getOwlBudget(): Promise<number> {
	const config = getKvConfig();
	if (!config) return localBudget;

	try {
		const stored = await kvGet(config, OWL_BUDGET_KV_KEY);
		if (stored != null) return stored;

		await kvSet(config, OWL_BUDGET_KV_KEY, DEFAULT_OWL_BUDGET_USD);
		return DEFAULT_OWL_BUDGET_USD;
	} catch (error) {
		console.error("[owlCount] budget get failed:", error);
		return DEFAULT_OWL_BUDGET_USD;
	}
}

export async function getOwlEconomy(): Promise<{ owls: number | null; budget: number }> {
	const [owls, budget] = await Promise.all([getOwlCount(), getOwlBudget()]);
	return { owls, budget };
}
