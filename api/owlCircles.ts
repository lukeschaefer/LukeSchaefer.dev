import type { OwlCircle } from "../src/utils/pencilfyOwl";

export const OWL_CANVAS_SIZE = 1024;
const MIN_RADIUS = 12;
const MAX_RADIUS = OWL_CANVAS_SIZE;
const COORD_MIN = -OWL_CANVAS_SIZE;
const COORD_MAX = OWL_CANVAS_SIZE * 2;

export class CircleRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CircleRequestError";
	}
}

function asFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCircle(value: unknown, label: string): OwlCircle {
	if (value == null || typeof value !== "object" || Array.isArray(value)) {
		throw new CircleRequestError(`Expected a valid \`${label}\`.`);
	}

	const rec = value as Record<string, unknown>;
	const cx = asFiniteNumber(rec.cx);
	const cy = asFiniteNumber(rec.cy);
	const rx = asFiniteNumber(rec.rx);
	const ry = asFiniteNumber(rec.ry);

	if (cx == null || cy == null || rx == null || ry == null) {
		throw new CircleRequestError(`Expected a valid \`${label}\`.`);
	}
	if (rx < MIN_RADIUS || ry < MIN_RADIUS || rx > MAX_RADIUS || ry > MAX_RADIUS) {
		throw new CircleRequestError(`Expected a valid \`${label}\`.`);
	}
	if (cx < COORD_MIN || cx > COORD_MAX || cy < COORD_MIN || cy > COORD_MAX) {
		throw new CircleRequestError(`Expected a valid \`${label}\`.`);
	}

	return { cx, cy, rx, ry };
}

export const DEFAULT_OWL_CIRCLES: [OwlCircle, OwlCircle] = [
	{ cx: 512, cy: 568, rx: 217, ry: 308 },
	{ cx: 420, cy: 255, rx: 110, ry: 115 },
];

export function circlesMatchDefault(circles: OwlCircle[]): boolean {
	const [first, second] = DEFAULT_OWL_CIRCLES;
	return (
		circles.length === 2 &&
		circleEqual(circles[0], first) &&
		circleEqual(circles[1], second)
	);
}

function circleEqual(a: OwlCircle | undefined, b: OwlCircle): boolean {
	return a != null && a.cx === b.cx && a.cy === b.cy && a.rx === b.rx && a.ry === b.ry;
}

export function parseRequestCircles(body: unknown): OwlCircle[] {
	if (body == null || typeof body !== "object" || Array.isArray(body)) {
		throw new CircleRequestError("Expected a JSON object.");
	}

	const { circle1, circle2 } = body as Record<string, unknown>;
	const first = parseCircle(circle1, "circle1");
	if (circle2 == null) return [first];
	return [first, parseCircle(circle2, "circle2")];
}
