import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { RoughCanvas } from "roughjs/bin/canvas";

export type OwlCircle = { cx: number; cy: number; rx: number; ry: number };

export type PencilCanvas = {
	width: number;
	height: number;
	getContext(contextId: "2d"): CanvasRenderingContext2D | null;
};

/** −1 = facing left, 0 = straight on, +1 = facing right. */
export type Facing = number;

// ============================================================================
// SECTION: math  →  would live in `owl/math.ts`
// Pure number/geometry helpers. No knowledge of owls, themes, or canvas.
// ============================================================================

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const effRadius = (c: OwlCircle) => (c.rx + c.ry) / 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function rotatePoint(
	x: number,
	y: number,
	ox: number,
	oy: number,
	angle: number,
): [number, number] {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dx = x - ox;
	const dy = y - oy;
	return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
}

/** How visible a left/right feature is for the current facing (−1…1). */
function sideVisibility(side: number, face: Facing): number {
	return 1 - Math.max(0, -side * face);
}

/** Run `draw` a few times so rough.js overlaps strokes into a sketchier mark. */
function sketch(times: number, draw: () => void) {
	for (let i = 0; i < times; i++) draw();
}

/** Closed polygon with quadratic fillets at each vertex, for rough.js `path()`. */
function roundedPolygonPath(points: [number, number][], radius: number): string {
	const n = points.length;
	if (n < 3) return "";

	const corners: {
		from: [number, number];
		to: [number, number];
		ctrl: [number, number];
	}[] = [];

	for (let i = 0; i < n; i++) {
		const prev = points[(i - 1 + n) % n]!;
		const curr = points[i]!;
		const next = points[(i + 1) % n]!;

		const dx1 = curr[0] - prev[0];
		const dy1 = curr[1] - prev[1];
		const dx2 = next[0] - curr[0];
		const dy2 = next[1] - curr[1];

		const len1 = Math.hypot(dx1, dy1) || 1;
		const len2 = Math.hypot(dx2, dy2) || 1;
		const r = Math.min(radius, len1 * 0.48, len2 * 0.48);

		corners.push({
			from: [curr[0] - (dx1 / len1) * r, curr[1] - (dy1 / len1) * r],
			to: [curr[0] + (dx2 / len2) * r, curr[1] + (dy2 / len2) * r],
			ctrl: curr,
		});
	}

	let d = `M ${corners[0]!.from[0]} ${corners[0]!.from[1]}`;
	for (let i = 0; i < n; i++) {
		const corner = corners[i]!;
		const next = corners[(i + 1) % n]!;
		d += ` Q ${corner.ctrl[0]} ${corner.ctrl[1]} ${corner.to[0]} ${corner.to[1]}`;
		d += ` L ${next.from[0]} ${next.from[1]}`;
	}
	return `${d} Z`;
}

/** Horizontal inside span of a simple polygon at a given y, or null if outside. */
function polygonSpanAtY(y: number, points: [number, number][]): [number, number] | null {
	const xs: number[] = [];
	const n = points.length;

	for (let i = 0; i < n; i++) {
		const a = points[i]!;
		const b = points[(i + 1) % n]!;
		const y0 = a[1];
		const y1 = b[1];

		if (y0 === y1) {
			if (y === y0) {
				xs.push(a[0], b[0]);
			}
			continue;
		}

		const minY = Math.min(y0, y1);
		const maxY = Math.max(y0, y1);
		if (y < minY || y > maxY) continue;

		const t = (y - y0) / (y1 - y0);
		xs.push(a[0] + t * (b[0] - a[0]));
	}

	if (xs.length < 2) return null;

	xs.sort((a, b) => a - b);
	return [xs[0]!, xs[xs.length - 1]!];
}

/** Flat-top eye: a circle with the top cropped, showing `arcRatio` of the circumference. */
function flatTopEyePath(
	cx: number,
	cy: number,
	r: number,
	arcRatio: number,
	tilt = 0,
): string {
	const ratio = clamp(arcRatio, 0.05, 1);
	const hiddenHalf = (1 - ratio) * Math.PI;
	const startAngle = -Math.PI / 2 + hiddenHalf;
	const endAngle = -Math.PI / 2 - hiddenHalf;
	const ux1 = cx + r * Math.cos(startAngle);
	const uy1 = cy + r * Math.sin(startAngle);
	const ux2 = cx + r * Math.cos(endAngle);
	const uy2 = cy + r * Math.sin(endAngle);
	const [x1, y1] = rotatePoint(ux1, uy1, cx, cy, tilt);
	const [x2, y2] = rotatePoint(ux2, uy2, cx, cy, tilt);
	const rotationDeg = (tilt * 180) / Math.PI;

	return `M ${x1} ${y1} A ${r} ${r} ${rotationDeg} ${ratio > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/** Upward-arched brow stroke above an eye; endpoints sit on a line, peak rises by `curve`. */
function sampleQuadratic(
	p0: [number, number],
	p1: [number, number],
	p2: [number, number],
	steps = 14,
): [number, number][] {
	const points: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const mt = 1 - t;
		points.push([
			mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
			mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
		]);
	}
	return points;
}

function eyebrowPoints(
	cx: number,
	baseY: number,
	halfWidth: number,
	curve: number,
	tilt: number,
): [number, number][] {
	const [lx, ly] = rotatePoint(cx - halfWidth, baseY, cx, baseY, tilt);
	const [rx, ry] = rotatePoint(cx + halfWidth, baseY, cx, baseY, tilt);
	const [px, py] = rotatePoint(cx, baseY - curve, cx, baseY, tilt);

	return sampleQuadratic([lx, ly], [px, py], [rx, ry]);
}

function drawEyebrow(
	rc: RoughCanvas,
	cx: number,
	baseY: number,
	halfWidth: number,
	curve: number,
	tilt: number,
	style: Options,
) {
	const points = eyebrowPoints(cx, baseY, halfWidth, curve, tilt);
	sketch(2, () => rc.curve(points, style));
}

// ============================================================================
// SECTION: grouping  →  would live in `owl/grouping.ts`
// Decides which user circles belong to the same owl. No drawing.
// ============================================================================

function sameOwl(a: OwlCircle, b: OwlCircle): boolean {
	const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
	const ra = effRadius(a);
	const rb = effRadius(b);
	return dist <= ra + rb + 0.1 * Math.min(ra, rb);
}

function groupOwls(circles: OwlCircle[]): OwlCircle[][] {
	const seen = new Array(circles.length).fill(false);
	const groups: OwlCircle[][] = [];

	for (let i = 0; i < circles.length; i++) {
		if (seen[i]) continue;
		const group: OwlCircle[] = [];
		const stack = [i];
		seen[i] = true;

		while (stack.length) {
			const k = stack.pop()!;
			group.push(circles[k]);
			for (let j = 0; j < circles.length; j++) {
				if (!seen[j] && sameOwl(circles[k], circles[j])) {
					seen[j] = true;
					stack.push(j);
				}
			}
		}

		groups.push(group);
	}

	return groups;
}

// ============================================================================
// SECTION: silhouette  →  would live in `owl/silhouette.ts`
// Turns a group of circles into a single smooth outline polygon via a
// smooth-min metaball field + marching squares. Pure geometry, no anatomy.
// ============================================================================

type MaskBounds = { minX: number; minY: number; width: number; height: number };

function groupMaskBounds(group: OwlCircle[]): MaskBounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const e of group) {
		minX = Math.min(minX, e.cx - e.rx);
		minY = Math.min(minY, e.cy - e.ry);
		maxX = Math.max(maxX, e.cx + e.rx);
		maxY = Math.max(maxY, e.cy + e.ry);
	}
	const pad = Math.max(maxX - minX, maxY - minY) * 0.15;
	return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

// Normalised ellipse "distance": <1 inside, 1 on the boundary, >1 outside.
function ellipseField(x: number, y: number, e: OwlCircle): number {
	return Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);
}

// Polynomial smooth-min: like min(a, b) but with a rounded fillet of size k
// where the two fields meet. This is what softens the circle junctions.
function smin(a: number, b: number, k: number): number {
	const h = Math.max(k - Math.abs(a - b), 0) / k;
	return Math.min(a, b) - h * h * k * 0.25;
}

// Softened union field over the whole group; the silhouette is the iso-line
// where this equals 1.
function unionField(x: number, y: number, group: OwlCircle[]): number {
	let d = Infinity;
	for (const e of group) d = smin(d, ellipseField(x, y, e), 0.25);
	return d;
}

function chaikinSmooth(points: [number, number][], iterations: number): [number, number][] {
	let pts = points;
	for (let iter = 0; iter < iterations; iter++) {
		const next: [number, number][] = [];
		for (let i = 0; i < pts.length; i++) {
			const p0 = pts[i];
			const p1 = pts[(i + 1) % pts.length];
			next.push(
				[0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]],
				[0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]],
			);
		}
		pts = next;
	}
	return pts;
}

// Marching squares over the smooth-min field: walks the iso-contour cell by
// cell, emitting interpolated crossing segments, then chains them into a loop.
// Follows any union shape exactly — no star-shape assumption, so nothing gets
// chopped off or bridged with chords.
function unionOutline(group: OwlCircle[]): [number, number][] {
	const bounds = groupMaskBounds(group);
	const cols = 130;
	const rows = Math.max(80, Math.round(cols * (bounds.height / bounds.width)));
	const dx = bounds.width / cols;
	const dy = bounds.height / rows;

	// Field sampled at grid corners, shifted so the contour sits at 0.
	const field = new Float32Array((cols + 1) * (rows + 1));
	for (let j = 0; j <= rows; j++) {
		for (let i = 0; i <= cols; i++) {
			field[j * (cols + 1) + i] =
				unionField(bounds.minX + i * dx, bounds.minY + j * dy, group) - 1;
		}
	}
	const at = (i: number, j: number) => field[j * (cols + 1) + i];

	// For each cell edge crossed by the contour, interpolate the crossing point.
	const key = (x: number, y: number) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
	const segments: [number, number, number, number][] = [];

	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			const tl = at(i, j);
			const tr = at(i + 1, j);
			const br = at(i + 1, j + 1);
			const bl = at(i, j + 1);

			let caseIdx = 0;
			if (tl < 0) caseIdx |= 8;
			if (tr < 0) caseIdx |= 4;
			if (br < 0) caseIdx |= 2;
			if (bl < 0) caseIdx |= 1;
			if (caseIdx === 0 || caseIdx === 15) continue;

			const x0 = bounds.minX + i * dx;
			const y0 = bounds.minY + j * dy;
			const top: [number, number] = [x0 + (tl / (tl - tr)) * dx, y0];
			const bottom: [number, number] = [x0 + (bl / (bl - br)) * dx, y0 + dy];
			const left: [number, number] = [x0, y0 + (tl / (tl - bl)) * dy];
			const right: [number, number] = [x0 + dx, y0 + (tr / (tr - br)) * dy];

			const emit = (a: [number, number], b: [number, number]) =>
				segments.push([a[0], a[1], b[0], b[1]]);

			switch (caseIdx) {
				case 1: emit(left, bottom); break;
				case 2: emit(bottom, right); break;
				case 3: emit(left, right); break;
				case 4: emit(top, right); break;
				case 5: emit(top, left); emit(bottom, right); break;
				case 6: emit(top, bottom); break;
				case 7: emit(top, left); break;
				case 8: emit(top, left); break;
				case 9: emit(top, bottom); break;
				case 10: emit(top, right); emit(bottom, left); break;
				case 11: emit(top, right); break;
				case 12: emit(left, right); break;
				case 13: emit(bottom, right); break;
				case 14: emit(left, bottom); break;
			}
		}
	}

	if (segments.length === 0) return [];

	// Chain segments into loops, matching either endpoint (segment orientation
	// from the case table is not consistent). Keep the longest loop.
	const byEndpoint = new Map<string, [number, number, number, number][]>();
	const link = (k: string, seg: [number, number, number, number]) => {
		const list = byEndpoint.get(k);
		if (list) list.push(seg);
		else byEndpoint.set(k, [seg]);
	};
	for (const seg of segments) {
		link(key(seg[0], seg[1]), seg);
		link(key(seg[2], seg[3]), seg);
	}

	const used = new Set<[number, number, number, number]>();
	let best: [number, number][] = [];

	for (const start of segments) {
		if (used.has(start)) continue;

		used.add(start);
		const loop: [number, number][] = [
			[start[0], start[1]],
			[start[2], start[3]],
		];

		for (;;) {
			const [px, py] = loop[loop.length - 1];
			const candidates = byEndpoint.get(key(px, py)) ?? [];
			const next = candidates.find((s) => !used.has(s));
			if (!next) break;

			used.add(next);
			// Append whichever end of the segment isn't the current point.
			if (key(next[0], next[1]) === key(px, py)) loop.push([next[2], next[3]]);
			else loop.push([next[0], next[1]]);
		}

		if (loop.length > best.length) best = loop;
	}

	// Decimate the dense grid trace before smoothing so rough.js gets a
	// reasonably sized polygon.
	const targetPoints = 128;
	const stride = Math.max(1, Math.floor(best.length / targetPoints));
	const decimated = best.filter((_, i) => i % stride === 0);

	return chaikinSmooth(decimated, 2);
}

// ============================================================================
// SECTION: theme  →  would live in `owl/theme.ts`
// A theme owns the *look*: stroke options per "ink role" and the named
// proportions parts read instead of hardcoding magic numbers. New looks
// ("Angry owl", etc.) become new Theme objects — parts never change.
// ============================================================================

const INK = "55, 65, 81";
const ink = (alpha: number) => `rgba(${INK}, ${alpha})`;

/** The stroke "roles" any part can ask the theme for. */
type InkRole = "outline" | "mergedOutline" | "tail" | "detail" | "feather" | "faceFeather" | "fill";

/** Named, overridable geometry ratios. All are fractions of head/body radii. */
type Proportions = {
	headYawMax: number;
	eyeSpread: number;
	eyeYOffset: number;
	/** Eye radius as a fraction of the smaller head radius. */
	eyeSize: number;
	/** Visible fraction of the eye circle (e.g. 2/3 = flat top, bottom two-thirds shown). */
	eyeArc: number;
	/** Inward rotation per eye, in radians (left eye +tilt, right eye −tilt). */
	eyeTilt: number;
	/** Gap above the eye center to brow endpoints, as a multiple of eye radius. */
	browGap: number;
	/** Brow span width as a multiple of eye radius. */
	browWidth: number;
	/** Upward arch height as a multiple of eye radius. */
	browCurve: number;
	/** Multiplier on `eyeTilt` applied to each brow (1 = match the eyes). */
	browTilt: number;
	/** Detail stroke width for brow arcs. */
	browStrokeWidth: number;
	pupilShift: number;
	pupilSize: number;
	beakHalfWidth: number;
	beakHeightRatio: number;
	beakAnchorY: number;
	beakAngleMax: number;
	tailTopHalfWidth: number;
	tailBottomHalfWidth: number;
	tailApexY: number;
	tailHeight: number;
	tailFarCornerDrop: number;
	tailCornerRadius: number;
	tailTurnOffset: number;
	tailFeatherRows: number;
	tailFeatherLength: number;
	footSpread: number;
	footHalfWidth: number;
	footHeight: number;
	footLean: number;
	footBaseY: number;
	perchLift: number;
	perchGap: number;
	perchExtend: number;
	perchChance: number;
	featherRows: number;
	featherLength: number;
	/** Wing feather wide:long ratio (perpendicular : along flow). */
	featherAspect: number;
	/** Row spacing as a multiple of feather length (lower = denser). */
	featherSpacing: number;
	featherBaseFill: number;
	/** Random darkening added to each scale fill, up to this fraction (e.g. 0.1). */
	featherFillVariation: number;
	faceLayers: number;
	faceSpread: number;
	faceFeatherSpan: number;
	faceDensity: number;
};

type Theme = {
	id: string;
	styles: Record<InkRole, Options>;
	proportions: Proportions;
};

// curveFitting: 1 keeps rough.js from jittering rx/ry independently (which warps aspect).
const DEFAULT_PROPORTIONS: Proportions = {
	headYawMax: Math.PI / 3,
	eyeSpread: 0.42,
	eyeYOffset: 0.12,
	eyeSize: 0.23,
	eyeArc: 3 / 4,
	eyeTilt: (15 * Math.PI) / 180,
	browGap: 0.2,
	browWidth: 3,
	browCurve: -0.78,
	browTilt: 2,
	browStrokeWidth: 6,
	pupilShift: 0.4,
	pupilSize: 0.7,
	beakHalfWidth: 0.14,
	beakHeightRatio: 1.5,
	beakAnchorY: 0.08,
	beakAngleMax: Math.PI / 4,
	tailTopHalfWidth: 0.72,
	tailBottomHalfWidth: 0.29,
	tailApexY: 0.25,
	tailHeight: 9 / 12,
	tailFarCornerDrop: 0.2,
	tailCornerRadius: 0.07,
	tailTurnOffset: 0.4,
	tailFeatherRows: 16,
	tailFeatherLength: 0.16,
	footSpread: 0.34,
	footHalfWidth: 0.16,
	footHeight: 0.12,
	footLean: 0.08,
	footBaseY: 0.65,
	perchLift: 0.045,
	perchGap: 0.9,
	perchExtend: 0.95,
	perchChance: 0.85,
	featherRows: 36,
	featherLength: 0.28 * 1.3,
	featherAspect: 2,
	featherSpacing: 0.42,
	featherBaseFill: 0.35,
	featherFillVariation: 0.1,
	faceLayers: 8,
	faceSpread: 1.45,
	faceFeatherSpan: 0.28,
	faceDensity: 34,
};

const DEFAULT_THEME: Theme = {
	id: "pencil",
	styles: {
		outline: {
			roughness: 2,
			bowing: 1,
			stroke: ink(0.34),
			strokeWidth: 3.5,
			curveFitting: 1,
		},
		mergedOutline: {
			roughness: 2,
			bowing: 1,
			stroke: ink(0.34),
			strokeWidth: 3.5,
			curveFitting: 1,
			preserveVertices: true,
		},
		tail: {
			roughness: 1.8,
			bowing: 1,
			stroke: ink(0.3),
			strokeWidth: 3,
		},
		detail: { roughness: 2.1, bowing: 1.2, stroke: ink(0.5), strokeWidth: 3 },
		feather: { roughness: 2.1, bowing: 1.2, stroke: ink(0.15), strokeWidth: 3 },
		faceFeather: { roughness: 2.1, bowing: 1.2, stroke: ink(0.08), strokeWidth: 2.5 },
		fill: {
			roughness: 1.4,
			stroke: ink(0.75),
			strokeWidth: 1.5,
			fill: ink(0.7),
			fillStyle: "solid",
		},
	},
	proportions: DEFAULT_PROPORTIONS,
};

// ============================================================================
// SECTION: rig  →  would live in `owl/rig.ts`
// Builds the owl "model": which circle is head vs body, the facing value, the
// silhouette outline, and the proportions in play. This is pure data computed
// once up front — parts read it, they never re-derive structure themselves.
// ============================================================================

type OwlModel = {
	group: OwlCircle[];
	head: OwlCircle;
	body: OwlCircle;
	facing: Facing;
	/** Smooth merged silhouette; empty for a single-circle owl (drawn as an ellipse). */
	outline: [number, number][];
	proportions: Proportions;
};

/** Head offset relative to body → facing in [−1, 1]. */
export function computeFacing(head: OwlCircle, body: OwlCircle): Facing {
	return clamp((head.cx - body.cx) / Math.max(body.rx, 1), -1, 1);
}

// Pick the head circle: mostly whichever sits highest above the group's lowest
// point, with a boost for smaller circles that sit off to the side (so a slightly
// lower, smaller, lateral circle can still win over a bigger centred one).
function pickHead(group: OwlCircle[]): OwlCircle {
	const floorY = Math.max(...group.map((c) => c.cy + c.ry));
	const groupCx = group.reduce((s, c) => s + c.cx, 0) / group.length;
	const maxArea = Math.max(...group.map((c) => c.rx * c.ry));
	const span = Math.max(...group.map((c) => c.rx), 1);

	let best = group[0];
	let bestScore = -Infinity;

	for (const c of group) {
		const heightAbove = floorY - c.cy;
		const smallness = 1 - (c.rx * c.ry) / maxArea;
		const lateral = Math.abs(c.cx - groupCx) / span;

		const score = heightAbove + smallness * span * 0.35 + lateral * smallness * span * 0.45;

		if (score > bestScore) {
			bestScore = score;
			best = c;
		}
	}

	return best;
}

function classify(group: OwlCircle[]): { head: OwlCircle; body: OwlCircle } {
	if (group.length === 1) {
		const body = group[0];
		const head = {
			cx: body.cx,
			cy: body.cy - body.ry * 0.35,
			rx: body.rx * 0.7,
			ry: body.ry * 0.5,
		};
		return { head, body };
	}

	const head = pickHead(group);
	const body = group
		.filter((c) => c !== head)
		.reduce((largest, c) => (c.rx * c.ry > largest.rx * largest.ry ? c : largest));

	return { head, body };
}

function buildOwlModel(group: OwlCircle[], theme: Theme): OwlModel {
	const { head, body } = classify(group);
	return {
		group,
		head,
		body,
		facing: computeFacing(head, body),
		outline: group.length > 1 ? unionOutline(group) : [],
		proportions: theme.proportions,
	};
}

// The head is modelled as a sphere that yaws with the facing value (±90° at
// full turn). Features live at fixed longitudes on that sphere; projecting
// them gives screen x = sin(longitude + yaw) and depth = cos(longitude + yaw).
// Features rotate to the correct spot, foreshorten as they approach the limb,
// and disappear naturally once they cross onto the back hemisphere.
function projectOnHead(owl: OwlModel, longitude: number) {
	const angle = longitude + owl.facing * owl.proportions.headYawMax;
	return {
		x: owl.head.cx + owl.head.rx * Math.sin(angle),
		depth: Math.cos(angle),
	};
}

// Projects an arbitrary direction on the head sphere — given relative to
// face-forward (+z toward the viewer, +x screen-right, +y screen-down) — into
// screen space, applying the head's yaw. `depth` > 0 is the visible front
// hemisphere. This plants features flat on the sphere surface so they track the
// head as it turns instead of hovering above the circle.
function projectFaceDir(owl: OwlModel, vx: number, vy: number, vz: number) {
	const yaw = owl.facing * owl.proportions.headYawMax;
	const cosY = Math.cos(yaw);
	const sinY = Math.sin(yaw);
	return {
		x: owl.head.cx + owl.head.rx * (vx * cosY + vz * sinY),
		y: owl.head.cy + owl.head.ry * vy,
		depth: -vx * sinY + vz * cosY,
	};
}

// ============================================================================
// SECTION: parts  →  would live in `owl/parts/*.ts` + `owl/parts/registry.ts`
// Each anatomical feature is a self-contained `Part`. A part reads the model
// + theme from the RenderContext, draws itself, and can publish anchors for
// later parts to consume (e.g. feet → perch). Adding a feature = add a Part
// and list it in the registry; ordering and toggling are declarative.
// ============================================================================

type RenderContext = {
	rc: RoughCanvas;
	ctx: CanvasRenderingContext2D;
	canvas: PencilCanvas;
	theme: Theme;
	owl: OwlModel;
	/** Shared scratch space for inter-part dependencies (keyed by part). */
	anchors: Map<string, unknown>;
};

type Part = {
	id: string;
	/** Draw order, low to high. */
	z: number;
	/** Optional gate; the part is skipped when this returns false. */
	enabled?: (c: RenderContext) => boolean;
	draw: (c: RenderContext) => void;
};

function drawRotatedEllipse(
	rc: RoughCanvas,
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	width: number,
	height: number,
	angle: number,
	options: Options,
) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(angle);
	rc.ellipse(0, 0, width, height, options);
	ctx.restore();
}

/** Slight horizontal wrap: ovals stay mostly level, with a small lean toward each flank. */
function featherTilt(px: number, body: OwlCircle, maxTilt = (12 * Math.PI) / 180): number {
	return ((px - body.cx) / Math.max(body.rx, 1)) * maxTilt;
}

/** Squat oval size with `aspect` wide-to-long ratio (2 = twice as wide). */
function wingFeatherSize(len: number, aspect: number): { along: number; across: number } {
	const along = Math.max(2, len / aspect);
	const across = Math.max(2, len);
	return { along, across };
}

const FEATHER_WING_FILL = "#ecece6";
const FEATHER_BODY_FILL = "#ffffff";

/** Slightly darken a hex fill by up to `variation` × 255 (e.g. 0.1 ≈ random/10). */
function varyScaleFill(
	baseHex: string,
	variation: number,
): { fill: string; fillStyle: "solid" } {
	if (variation <= 0) return { fill: baseHex, fillStyle: "solid" };

	const n = Number.parseInt(baseHex.slice(1), 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	const shade = Math.round(Math.random() * variation * 255);
	const byte = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");

	return {
		fill: `#${byte(r - shade)}${byte(g - shade)}${byte(b - shade)}`,
		fillStyle: "solid",
	};
}

function scaleStyle(feather: Options, baseHex: string, variation: number): Options {
	return { ...feather, ...varyScaleFill(baseHex, variation) };
}

/** X coordinate where the belly→beak split line crosses a given row. */
function scaleLineXAtY(x0: number, y0: number, x1: number, y1: number, y: number): number {
	const dy = y1 - y0;
	if (Math.abs(dy) < 1e-6) return x0;
	return x0 + ((y - y0) / dy) * (x1 - x0);
}

type FishscaleDrawArgs = {
	rc: RoughCanvas;
	ctx: CanvasRenderingContext2D;
	feather: Options;
	body: OwlCircle;
	colPitch: number;
	featherLen: number;
	aspect: number;
	rows: number;
	topY: number;
	bottomY: number;
	splitX0: number;
	splitY0: number;
	splitX1: number;
	splitY1: number;
	rowSpan: (rowY: number) => [number, number] | null;
	sizeScale: (rowY: number, tRow: number, px: number) => number;
	fill: (px: number, rowY: number) => string;
	fillVariation: number;
};

/** Bottom-up fishscales split at the belly→beak line: left half L→R, right half R→L. */
function drawSplitFishscales(args: FishscaleDrawArgs) {
	const {
		rc,
		ctx,
		feather,
		body,
		colPitch,
		featherLen,
		aspect,
		rows,
		topY,
		bottomY,
		splitX0,
		splitY0,
		splitX1,
		splitY1,
		rowSpan,
		sizeScale,
		fill,
		fillVariation,
	} = args;

	for (let r = rows - 1; r >= 0; r--) {
		const tRow = rows === 1 ? 0.5 : r / (rows - 1);
		const rowY = lerp(topY, bottomY, tRow);
		const span = rowSpan(rowY);
		if (!span) continue;

		const [leftX, rightX] = span;
		if (rightX - leftX < 4) continue;

		const xSplit = scaleLineXAtY(splitX0, splitY0, splitX1, splitY1, rowY);
		const stagger = (r % 2) * 0.5 * colPitch;
		const leftEnd = Math.min(xSplit, rightX);
		const rightStart = Math.max(xSplit, leftX);

		const drawScale = (px: number) => {
			const len = featherLen * sizeScale(rowY, tRow, px);
			if (len < 2) return;

			const { along, across } = wingFeatherSize(len, aspect);
			const tilt = featherTilt(px, body);
			drawRotatedEllipse(
				rc,
				ctx,
				px,
				rowY,
				across,
				along,
				tilt,
				scaleStyle(feather, fill(px, rowY), fillVariation),
			);
		};

		for (let col = 0; ; col++) {
			const px = leftX + stagger + col * colPitch;
			if (px > leftEnd + 0.5) break;
			drawScale(px);
		}

		for (let col = 0; ; col++) {
			const px = rightX - stagger - col * colPitch;
			if (px < rightStart - 0.5) break;
			drawScale(px);
		}
	}
}

const outlinePart: Part = {
	id: "outline",
	z: 0,
	draw({ rc, owl, theme }) {
		const whiteFill = { fill: "#ffffff", fillStyle: "solid" as const };

		if (owl.group.length === 1) {
			const c = owl.body;
			rc.ellipse(c.cx, c.cy, c.rx * 2, c.ry * 2, {
				...theme.styles.outline,
				...whiteFill,
			});
			return;
		}
		rc.polygon(owl.outline, { ...theme.styles.mergedOutline, ...whiteFill });
	},
};

const TAIL_GEOMETRY = "tailGeometry";

type TailGeometry = {
	points: [number, number][];
	path: string;
	topY: number;
	bottomY: number;
};

function computeTailGeometry(owl: OwlModel): TailGeometry {
	const { body, facing } = owl;
	const p = owl.proportions;

	const topY = body.cy + body.ry / 3;
	const tailPixelHeight = body.ry * p.tailHeight;
	const bottomY = topY + tailPixelHeight;
	const topHalfWidth = body.rx * p.tailTopHalfWidth;
	const bottomHalfWidth = body.rx * p.tailBottomHalfWidth;
	const topOffset = -facing * body.rx * p.tailTurnOffset;
	const bottomOffset = topOffset * 3;
	const turn = Math.abs(facing);
	const farCornerDrop = tailPixelHeight * p.tailFarCornerDrop * turn;
	const bottomLeftY = bottomY + (facing < 0 ? farCornerDrop : 0);
	const bottomRightY = bottomY + (facing > 0 ? farCornerDrop : 0);
	const cornerRadius = body.rx * p.tailCornerRadius;
	const apexY = body.cy - body.ry + p.tailApexY * (body.ry * 2);

	const points: [number, number][] = [
		[body.cx, apexY],
		[body.cx + topOffset - topHalfWidth, topY],
		[body.cx + bottomOffset - bottomHalfWidth, bottomLeftY],
		[body.cx + bottomOffset + bottomHalfWidth, bottomRightY],
		[body.cx + topOffset + topHalfWidth, topY],
	];

	return {
		points,
		path: roundedPolygonPath(points, cornerRadius),
		topY,
		bottomY: Math.max(bottomLeftY, bottomRightY),
	};
}

const tailPart: Part = {
	id: "tail",
	z: -10,
	draw({ owl, anchors }) {
		anchors.set(TAIL_GEOMETRY, computeTailGeometry(owl));
	},
};

const tailFeathersPart: Part = {
	id: "tailFeathers",
	z: -9,
	draw({ rc, ctx, owl, theme, anchors }) {
		const geo = anchors.get(TAIL_GEOMETRY) as TailGeometry | undefined;
		if (!geo) return;

		const { body, head } = owl;
		const p = theme.proportions;
		const feather = theme.styles.feather;
		const featherLen = body.rx * p.tailFeatherLength;
		const { across } = wingFeatherSize(featherLen, p.featherAspect);
		const colPitch = across * p.featherSpacing;
		const beakX = projectOnHead(owl, 0).x;
		const beakY = head.cy + head.ry * p.beakAnchorY;

		ctx.save();
		ctx.clip(new Path2D(geo.path));

		drawSplitFishscales({
			rc,
			ctx,
			feather,
			body,
			colPitch,
			featherLen,
			aspect: p.featherAspect,
			rows: p.tailFeatherRows,
			topY: geo.topY,
			bottomY: geo.bottomY,
			splitX0: body.cx,
			splitY0: body.cy + body.ry,
			splitX1: beakX,
			splitY1: beakY,
			rowSpan: (rowY) => polygonSpanAtY(rowY, geo.points),
			sizeScale: (_rowY, tRow) => lerp(0.78, 1, tRow),
			fill: () => FEATHER_WING_FILL,
			fillVariation: p.featherFillVariation,
		});

		ctx.restore();
	},
};

/** How much of this side's half-width (edge → centre) is the "wing" wrap. */
function wingFillFrac(side: number, face: Facing, baseFill: number): number {
	const turn = Math.abs(face);
	const dir = face === 0 ? 0 : Math.sign(face);
	if (sideVisibility(side, face) <= 0) return 0;

	const onBeakSide = dir !== 0 && side === dir;
	return onBeakSide ? lerp(baseFill, 0.08, turn) : lerp(baseFill, 0.8, turn);
}

function isWingScale(
	px: number,
	py: number,
	body: OwlCircle,
	face: Facing,
	baseFill: number,
	beakY: number,
): boolean {
	if (py < beakY) return false;

	const side = px >= body.cx ? 1 : -1;
	const fillFrac = wingFillFrac(side, face, baseFill);
	if (fillFrac <= 0) return false;

	const norm = (py - body.cy) / body.ry;
	if (Math.abs(norm) >= 0.98) return false;

	const halfWidth = body.rx * Math.sqrt(1 - norm * norm);
	if (halfWidth < 1) return false;

	const inwardFrac = (halfWidth - Math.abs(px - body.cx)) / halfWidth;
	return inwardFrac <= fillFrac;
}

// Fishscale ovals covering the whole body.
// ovals stay mostly horizontal with a slight flank lean. White fill everywhere;
// the old wing-coverage region gets an opaque off-white fill so the 3D turn still reads.
const feathersPart: Part = {
	id: "feathers",
	z: 10,
	draw({ rc, ctx, owl, theme }) {
		const { body, head, facing: face } = owl;
		const p = theme.proportions;
		const feather = theme.styles.feather;
		const beakY = head.cy + head.ry * p.beakAnchorY;

		const featherLen = body.rx * p.featherLength;
		const { across } = wingFeatherSize(featherLen, p.featherAspect);
		const colPitch = across * p.featherSpacing;
		const beakX = projectOnHead(owl, 0).x;
		const bandTop = body.cy - body.ry * 0.94;
		const bandBot = body.cy + body.ry * 0.94;

		ctx.save();
		ctx.beginPath();
		ctx.ellipse(body.cx, body.cy, body.rx, body.ry, 0, 0, Math.PI * 2);
		ctx.clip();

		drawSplitFishscales({
			rc,
			ctx,
			feather,
			body,
			colPitch,
			featherLen,
			aspect: p.featherAspect,
			rows: p.featherRows,
			topY: bandTop,
			bottomY: bandBot,
			splitX0: body.cx,
			splitY0: body.cy + body.ry,
			splitX1: beakX,
			splitY1: beakY,
			rowSpan: (rowY) => {
				const norm = (rowY - body.cy) / body.ry;
				if (Math.abs(norm) >= 0.98) return null;
				const halfWidth = body.rx * Math.sqrt(1 - norm * norm);
				if (halfWidth < 2) return null;
				return [body.cx - halfWidth, body.cx + halfWidth];
			},
			sizeScale: (rowY, _tRow, _px) => {
				const norm = (rowY - body.cy) / body.ry;
				return lerp(1, 0.78, Math.abs(norm));
			},
			fill: (px, rowY) =>
				isWingScale(px, rowY, body, face, p.featherBaseFill, beakY)
					? FEATHER_WING_FILL
					: FEATHER_BODY_FILL,
			fillVariation: p.featherFillVariation,
		});

		ctx.restore();
	},
};

function drawTalon(
	rc: RoughCanvas,
	baseX: number,
	baseY: number,
	halfW: number,
	height: number,
	cheatX: number,
	style: Options,
) {
	rc.polygon(
		[
			[baseX - halfW, baseY],
			[baseX + halfW, baseY],
			[baseX + cheatX, baseY + height],
		],
		style,
	);
}

const WHITE_FILL = { fill: "#ffffff", fillStyle: "solid" as const };
const FOOT_LAYOUT = "footLayout";

type TalonDraw = {
	baseX: number;
	footBaseY: number;
	talonHalfW: number;
	talonH: number;
	cheatX: number;
};

type FootLayout = {
	footBottoms: [number, number][];
	talons: TalonDraw[];
};

function computeFootLayout(owl: OwlModel, theme: Theme): FootLayout {
	const { body, facing: face } = owl;
	const p = theme.proportions;

	const turn = Math.abs(face);
	const dir = face === 0 ? 0 : Math.sign(face);

	const footDX = body.rx * p.footSpread;
	const halfWidth = body.rx * p.footHalfWidth;
	const footH = body.ry * p.footHeight;
	const lean = face * body.rx * p.footLean;
	const baseFootY = body.cy + body.ry * p.footBaseY;

	const footBottoms: [number, number][] = [];
	const talons: TalonDraw[] = [];

	for (const side of [-1, 1] as const) {
		if (sideVisibility(side, face) <= 0) continue;

		const onFacingSide = dir !== 0 && side === dir;
		const footY = onFacingSide
			? lerp(baseFootY, body.cy + body.ry * 0.72, turn)
			: baseFootY;
		const fx =
			body.cx + side * footDX + lean + (onFacingSide ? side * body.rx * 0.14 * turn : 0);
		const footBaseY = footY + footH;

		const talonHalfW = halfWidth * 0.3;
		const talonH = footH * 0.9;
		for (const spread of [-0.62, 0, 0.62]) {
			const baseX = fx + spread * halfWidth;
			const cheatX = face * talonHalfW * (0.5 + 0.35 * Math.abs(spread)) * (turn || 1);
			talons.push({ baseX, footBaseY, talonHalfW, talonH, cheatX });
		}

		footBottoms.push([fx, footBaseY + talonH]);
	}

	return { footBottoms, talons };
}

const footLayoutPart: Part = {
	id: "footLayout",
	z: 15,
	draw({ owl, theme, anchors }) {
		anchors.set(FOOT_LAYOUT, computeFootLayout(owl, theme));
	},
};

function drawPerchBranch(
	rc: RoughCanvas,
	yAt: (x: number) => number,
	gap: number,
	startX: number,
	endX: number,
	detail: Options,
) {
	const topLeft: [number, number] = [startX, yAt(startX)];
	const topRight: [number, number] = [endX, yAt(endX)];
	const botRight: [number, number] = [endX, yAt(endX) + gap];
	const botLeft: [number, number] = [startX, yAt(startX) + gap];

	rc.polygon([topLeft, topRight, botRight, botLeft], {
		...detail,
		...WHITE_FILL,
		stroke: "transparent",
		strokeWidth: 0,
	});
	rc.line(startX, yAt(startX), endX, yAt(endX), detail);
	rc.line(startX, yAt(startX) + gap, endX, yAt(endX) + gap, detail);
}

// With both feet planted, sometimes perch the owl on a branch: two lines
// running under the feet and out to the canvas edges. Drawn before the feet
// so talons sit on top of the stick.
const perchPart: Part = {
	id: "perch",
	z: 20,
	enabled(c) {
		const layout = c.anchors.get(FOOT_LAYOUT) as FootLayout | undefined;
		return (
			!!layout &&
			layout.footBottoms.length === 2 &&
			Math.random() < c.theme.proportions.perchChance
		);
	},
	draw({ rc, owl, theme, canvas, anchors }) {
		const layout = anchors.get(FOOT_LAYOUT) as FootLayout;
		const p = theme.proportions;
		const [[x1, y1], [x2, y2]] = layout.footBottoms;
		const footH = owl.body.ry * p.footHeight;
		const lift = owl.body.ry * p.perchLift;

		const slope = (y2 - y1) / (x2 - x1 || 1);
		const yAt = (x: number) => y1 + (x - x1) * slope - lift;
		const gap = footH * p.perchGap;
		const detail = theme.styles.detail;

		const minFootX = Math.min(x1, x2);
		const maxFootX = Math.max(x1, x2);
		const extend = owl.body.rx * p.perchExtend;
		const startX = Math.max(0, minFootX - extend);
		const endX = Math.min(canvas.width, maxFootX + extend);

		drawPerchBranch(rc, yAt, gap, startX, endX, detail);
	},
};

const feetPart: Part = {
	id: "feet",
	z: 25,
	draw({ rc, theme, anchors }) {
		const layout = anchors.get(FOOT_LAYOUT) as FootLayout;
		const detail = theme.styles.detail;

		for (const talon of layout.talons) {
			drawTalon(
				rc,
				talon.baseX,
				talon.footBaseY,
				talon.talonHalfW,
				talon.talonH,
				talon.cheatX,
				detail,
			);
		}
	},
};

// The facial disc: concentric fishscale rings on the head sphere. Ovals stay
// squat (wide across the ring, short along the radial) and still emanate from
// the face centre so they track the head as it turns. Outer rings draw first
// so inner scales overlap them. Back-hemisphere feathers are culled.
const faceDiscPart: Part = {
	id: "faceDisc",
	z: 28,
	draw({ rc, ctx, owl, theme }) {
		const { head } = owl;
		const p = theme.proportions;
		const faceFeather = theme.styles.faceFeather;
		const span = p.faceFeatherSpan;

		ctx.save();
		ctx.beginPath();
		ctx.ellipse(head.cx, head.cy, head.rx, head.ry, 0, 0, Math.PI * 2);
		ctx.clip();

		for (let layer = p.faceLayers - 1; layer >= 0; layer--) {
			const rho = (layer + 0.5) / p.faceLayers;
			const layerBeta = rho * p.faceSpread;
			const count = Math.max(6, Math.round(p.faceDensity * Math.sin(layerBeta)));
			const step = (Math.PI * 2) / count;
			const stagger = (layer % 2) * (step * 0.5);

			for (let i = 0; i < count; i++) {
				const alpha = i * step + stagger;
				const ca = Math.cos(alpha);
				const sa = Math.sin(alpha);
				const base = projectFaceDir(
					owl,
					Math.sin(layerBeta) * ca,
					Math.sin(layerBeta) * sa,
					Math.cos(layerBeta),
				);
				if (base.depth <= 0.05) continue;

				const tip = projectFaceDir(
					owl,
					Math.sin(layerBeta + span) * ca,
					Math.sin(layerBeta + span) * sa,
					Math.cos(layerBeta + span),
				);

				const dx = tip.x - base.x;
				const dy = tip.y - base.y;
				const len = Math.hypot(dx, dy);
				if (len < 2) continue;

				const px = (base.x + tip.x) / 2;
				const py = (base.y + tip.y) / 2;
				const angle = Math.atan2(dy, dx);
				const { along, across } = wingFeatherSize(len, p.featherAspect);

				drawRotatedEllipse(
					rc,
					ctx,
					px,
					py,
					along,
					across,
					angle,
					scaleStyle(faceFeather, FEATHER_BODY_FILL, p.featherFillVariation),
				);
			}
		}

		ctx.restore();
	},
};

const eyesPart: Part = {
	id: "eyes",
	z: 30,
	draw({ rc, owl, theme }) {
		const { head, facing: face } = owl;
		const p = theme.proportions;

		const eyeY = head.cy - head.ry * p.eyeYOffset;
		const eyeR = Math.min(head.rx, head.ry) * p.eyeSize;
		const eyeLongitude = Math.asin(p.eyeSpread);

		for (const side of [-1, 1] as const) {
			const { x, depth } = projectOnHead(owl, side * eyeLongitude);
			if (depth <= 0) continue;

			// Soften foreshortening so the near eye doesn't shrink too aggressively.
			const r = eyeR * Math.sqrt(depth);
			if (r < 0.5) continue;

			const tilt = -side * p.eyeTilt;
			const eyePath = flatTopEyePath(x, eyeY, r, p.eyeArc, tilt);
			rc.path(eyePath, { ...theme.styles.detail, ...WHITE_FILL });
			sketch(2, () => rc.path(eyePath, theme.styles.detail));

			const pupilX = x + face * r * p.pupilShift;
			const pupilY = eyeY + r * (1 - p.eyeArc) * 0.35;
			const [px, py] = rotatePoint(pupilX, pupilY, x, eyeY, tilt);
			rc.circle(px, py, r * p.pupilSize, theme.styles.fill);
		}
	},
};

const browsPart: Part = {
	id: "brows",
	z: 32,
	draw({ rc, owl, theme }) {
		const { head } = owl;
		const p = theme.proportions;
		const browStyle = { ...theme.styles.detail, strokeWidth: p.browStrokeWidth };

		const eyeY = head.cy - head.ry * p.eyeYOffset;
		const eyeR = Math.min(head.rx, head.ry) * p.eyeSize;
		const eyeLongitude = Math.asin(p.eyeSpread);

		for (const side of [-1, 1] as const) {
			const { x, depth } = projectOnHead(owl, side * eyeLongitude);
			if (depth <= 0) continue;

			const r = eyeR * Math.sqrt(depth);
			if (r < 0.5) continue;

			const tilt = -side * p.eyeTilt * p.browTilt;
			const flatTopY = eyeY - r * Math.sin((1 - p.eyeArc) * Math.PI);
			const browBaseY = flatTopY - r * p.browGap;
			const halfWidth = (r * p.browWidth) / 2;
			const curve = r * p.browCurve;

			drawEyebrow(rc, x, browBaseY, halfWidth, curve, tilt, browStyle);
		}
	},
};

const beakPart: Part = {
	id: "beak",
	z: 40,
	draw({ rc, owl, theme }) {
		const { head, facing: face } = owl;
		const p = theme.proportions;

		// Fixed down-pointing triangle at longitude 0 on the head sphere — at full
		// turn it sits exactly on the circle's edge (tangent, profile view).
		// Rotates up to ±45° so the tip sweeps outward.
		const halfW = head.rx * p.beakHalfWidth;
		const height = halfW * 2 * p.beakHeightRatio;

		const anchorX = projectOnHead(owl, 0).x;
		const anchorY = head.cy + head.ry * p.beakAnchorY;
		const angle = -face * p.beakAngleMax;

		const corners: [[number, number], [number, number], [number, number]] = [
			[anchorX - halfW, anchorY],
			[anchorX + halfW, anchorY],
			[anchorX, anchorY + height],
		];

		const points = corners.map(([x, y]) => rotatePoint(x, y, anchorX, anchorY, angle));
		rc.polygon(points, { ...theme.styles.detail, ...WHITE_FILL });
		sketch(2, () => rc.polygon(points, theme.styles.detail));
	},
};

// The owl's anatomy, in draw order. New parts (wings, ear tufts, brows…) slot
// in here; `z` controls layering and `enabled` controls pose/theme variation.
const PARTS: Part[] = [
	tailPart,
	tailFeathersPart,
	outlinePart,
	feathersPart,
	footLayoutPart,
	perchPart,
	feetPart,
	faceDiscPart,
	eyesPart,
	browsPart,
	beakPart,
];

// ============================================================================
// SECTION: entry  →  would live in `owl/index.ts`
// Orchestration only: clear the canvas, group circles, build a model per owl,
// then run the part registry in z-order.
// ============================================================================

/**
 * Renders rough, pencil-like owl sketches into `canvas`, using the user's
 * circles as a guide. Circles that overlap (or nearly touch) are merged into a
 * single owl with a smooth metaball outline; circles further apart become their
 * own owls. Within an owl the smaller circle is the head and the larger the
 * body, and a single facing value (−1…1) smoothly drives eyes, beak, feet, and
 * feathers toward profile — hiding the far side entirely at ±1.
 */
export function pencilfyOwl(
	canvas: PencilCanvas,
	circles: OwlCircle[],
	options?: { background?: string | null },
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	if (options?.background === null) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	} else {
		ctx.fillStyle = options?.background ?? "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	if (circles.length === 0) return;

	const rc = rough.canvas(canvas as HTMLCanvasElement);
	const theme = DEFAULT_THEME;
	const parts = [...PARTS].sort((a, b) => a.z - b.z);

	for (const group of groupOwls(circles)) {
		const owl = buildOwlModel(group, theme);
		const context: RenderContext = { rc, ctx, canvas, theme, owl, anchors: new Map() };

		for (const part of parts) {
			if (part.enabled && !part.enabled(context)) continue;
			part.draw(context);
		}
	}
}
