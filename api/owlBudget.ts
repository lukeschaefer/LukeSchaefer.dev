export const DEFAULT_OWL_BUDGET_USD = 50;
export const OWL_COST_PER_OWL_USD = 0.06;

/** Vercel KV / Upstash key. Edit this number (USD) to add owl funds. */
export const OWL_BUDGET_KV_KEY = "owls:budget";

export function owlBudgetConsumed(count: number): number {
	return count * OWL_COST_PER_OWL_USD;
}

export function owlBudgetRemaining(count: number, budgetUsd: number): number {
	return Math.max(0, budgetUsd - owlBudgetConsumed(count));
}

export function canGenerateOwl(
	count: number | null | undefined,
	budgetUsd: number,
): boolean {
	if (count == null || !Number.isFinite(count)) return true;
	return owlBudgetConsumed(count) < budgetUsd;
}
