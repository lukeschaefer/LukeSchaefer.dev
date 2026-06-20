import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { RoughCanvas } from "roughjs/bin/canvas";

export type OwlCircle = { cx: number; cy: number; rx: number; ry: number };

/** −1 = facing left, 0 = straight on, +1 = facing right. */
export type Facing = number;

const INK = "55, 65, 81";
const ink = (alpha: number) => `rgba(${INK}, ${alpha})`;

// curveFitting: 1 keeps rough.js from jittering rx/ry independently (which warps aspect).
const OUTLINE: Options = {
	roughness: 2,
	bowing: 1,
	stroke: ink(0.34),
	strokeWidth: 3.5,
	curveFitting: 1,
};
const MERGED_OUTLINE: Options = {
	roughness: 2,
	bowing: 1,
	stroke: ink(0.34),
	strokeWidth: 3.5,
	curveFitting: 1,
	preserveVertices: true,
};

const DETAIL: Options = { roughness: 2.1, bowing: 1.2, stroke: ink(0.5), strokeWidth: 3 };
const FEATHER: Options = { roughness: 2.1, bowing: 1.2, stroke: ink(0.15), strokeWidth: 3 };
const SOLID: Options = {
	roughness: 1.4,
	stroke: ink(0.75),
	strokeWidth: 1.5,
	fill: ink(0.7),
	fillStyle: "solid",
};

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

/** Head offset relative to body → facing in [−1, 1]. */
export function computeFacing(head: OwlCircle, body: OwlCircle): Facing {
	return clamp((head.cx - body.cx) / Math.max(body.rx, 1), -1, 1);
}

function sketch(times: number, draw: () => void) {
	for (let i = 0; i < times; i++) draw();
}

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

type OwlParts = { head: OwlCircle; body: OwlCircle };

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

function classify(group: OwlCircle[]): OwlParts {
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
// Unlike the previous radial trace this follows any union shape exactly — no
// star-shape assumption, so nothing gets chopped off or bridged with chords.
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

function drawOutline(rc: RoughCanvas, group: OwlCircle[]) {
	if (group.length === 1) {
		const c = group[0];
		rc.ellipse(c.cx, c.cy, c.rx * 2, c.ry * 2, OUTLINE);
		return;
	}

	rc.polygon(unionOutline(group), MERGED_OUTLINE);
}

// The head is modelled as a sphere that yaws with the facing value (±90° at
// full turn). Features live at fixed longitudes on that sphere; projecting
// them gives screen x = sin(longitude + yaw) and depth = cos(longitude + yaw).
// Features rotate to the correct spot, foreshorten as they approach the limb,
// and disappear naturally once they cross onto the back hemisphere.
const HEAD_YAW_MAX = Math.PI / 2;
const EYE_LONGITUDE = Math.asin(0.42); // face-forward eye spread of 0.42·rx

function projectOnHead(head: OwlCircle, longitude: number, face: Facing) {
	const angle = longitude + face * HEAD_YAW_MAX;
	return {
		x: head.cx + head.rx * Math.sin(angle),
		depth: Math.cos(angle),
	};
}

function drawEyes(rc: RoughCanvas, head: OwlCircle, face: Facing) {
	const eyeY = head.cy - head.ry * 0.12;
	const eyeR = Math.min(head.rx, head.ry) * 0.32;

	for (const side of [-1, 1] as const) {
		const { x, depth } = projectOnHead(head, side * EYE_LONGITUDE, face);
		if (depth <= 0) continue;

		// Soften foreshortening so the near eye doesn't shrink too aggressively.
		const r = eyeR * Math.sqrt(depth);
		if (r < 0.5) continue;

		sketch(2, () => rc.circle(x, eyeY, r * 2, DETAIL));
		rc.circle(x + face * r * 0.4, eyeY, r * 0.7, SOLID);
	}
}

function drawBeak(rc: RoughCanvas, head: OwlCircle, face: Facing) {
	// Fixed down-pointing triangle (1.5:1 height:width) at longitude 0 on the
	// head sphere — at full turn it sits exactly on the circle's edge (tangent,
	// profile view). Rotates up to ±45° so the tip sweeps outward.
	const halfW = head.rx * 0.14;
	const height = halfW * 2 * 1.5;

	const anchorX = projectOnHead(head, 0, face).x;
	const anchorY = head.cy + head.ry * 0.08;
	const angle = -face * (Math.PI / 4);

	const corners: [[number, number], [number, number], [number, number]] = [
		[anchorX - halfW, anchorY],
		[anchorX + halfW, anchorY],
		[anchorX, anchorY + height],
	];

	const points = corners.map(([x, y]) => rotatePoint(x, y, anchorX, anchorY, angle));
	sketch(2, () => rc.polygon(points, DETAIL));
}

function drawTalon(
	rc: RoughCanvas,
	baseX: number,
	baseY: number,
	halfW: number,
	height: number,
	cheatX: number,
) {
	rc.polygon(
		[
			[baseX - halfW, baseY],
			[baseX + halfW, baseY],
			[baseX + cheatX, baseY + height],
		],
		DETAIL,
	);
}

function drawFeet(rc: RoughCanvas, body: OwlCircle, face: Facing, canvasWidth: number) {
	const turn = Math.abs(face);
	const dir = face === 0 ? 0 : Math.sign(face);

	const footDX = body.rx * 0.34;
	const halfWidth = body.rx * 0.16;
	const footH = body.ry * 0.12;
	const lean = face * body.rx * 0.08;
	const baseFootY = body.cy + body.ry * 0.9;

	const footBottoms: [number, number][] = [];

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
			drawTalon(rc, baseX, footBaseY, talonHalfW, talonH, cheatX);
		}

		footBottoms.push([fx, footBaseY + talonH]);
	}

	// With both feet planted, sometimes perch the owl on a branch: two lines
	// running under the feet and out to the canvas edges.
	if (footBottoms.length === 2 && Math.random() < 0.5) {
		const [[x1, y1], [x2, y2]] = footBottoms;
		const slope = (y2 - y1) / (x2 - x1 || 1);
		const yAt = (x: number) => y1 + (x - x1) * slope;
		const gap = footH * 0.9;

		rc.line(0, yAt(0), canvasWidth, yAt(canvasWidth), DETAIL);
		rc.line(0, yAt(0) + gap, canvasWidth, yAt(canvasWidth) + gap, DETAIL);
	}
}

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

// Feather band runs from topY to botY; full size at body centre (50% y), tapering to
// 25% at the top of the band and 10% toward the feet.
function featherVerticalScale(edgeY: number, body: OwlCircle): number {
	const topY = body.cy - body.ry * 0.45;
	const midY = body.cy;
	const botY = body.cy + body.ry * 0.85;

	if (edgeY <= midY) return lerp(0.25, 1, (edgeY - topY) / (midY - topY));
	return lerp(1, 0.1, (edgeY - midY) / (botY - midY));
}

// Direction of "feather flow" at a point: the downward-going tangent of the
// concentric ellipse through that point, blended toward straight down so
// feathers follow the body curve while still drooping.
function featherAngle(px: number, py: number, body: OwlCircle): number {
	const phi = Math.atan2((py - body.cy) / body.ry, (px - body.cx) / body.rx);
	let tx = -body.rx * Math.sin(phi);
	let ty = body.ry * Math.cos(phi);
	if (ty < 0) {
		tx = -tx;
		ty = -ty;
	}

	const tLen = Math.hypot(tx, ty) || 1;
	const downBlend = 0.4;
	const dx = (tx / tLen) * (1 - downBlend);
	const dy = (ty / tLen) * (1 - downBlend) + downBlend;
	return Math.atan2(dy, dx);
}

// Feathers are laid out in rows down each flank, with several smaller feathers
// per row filling inward from the body edge. As the owl turns, the fill area
// widens on the side opposite the beak and narrows on the beak side, as if the
// visible coverage wraps around a rounded body.
function drawFeathers(
	rc: RoughCanvas,
	ctx: CanvasRenderingContext2D,
	body: OwlCircle,
	face: Facing,
) {
	const rows = 24;
	const turn = Math.abs(face);
	const dir = face === 0 ? 0 : Math.sign(face);
	const featherLen = body.rx * 0.28 * 1.3;
	const spacing = featherLen * 0.6;
	const bandTop = body.cy - body.ry * 0.45;
	const bandBot = body.cy + body.ry * 0.85;

	for (const side of [-1, 1] as const) {
		if (sideVisibility(side, face) <= 0) continue;

		// Fraction of the half-width (edge → centre) this side's feathers fill.
		const onBeakSide = dir !== 0 && side === dir;
		const onAwaySide = dir !== 0 && side === -dir;
		const fillFrac = onBeakSide ? lerp(0.35, 0.08, turn) : lerp(0.35, 0.8, turn);
		const outwardTurn = onAwaySide ? ((-side * 10 * Math.PI) / 180) * turn : 0;

		for (let r = 0; r < rows; r++) {
			const tRow = rows === 1 ? 0.5 : r / (rows - 1);
			const rowY = lerp(bandTop, bandBot, tRow) + rand(-0.03, 0.03) * body.ry;
			const norm = (rowY - body.cy) / body.ry;
			if (Math.abs(norm) >= 0.98) continue;

			const halfWidth = body.rx * Math.sqrt(1 - norm * norm);
			const sizeScale = featherVerticalScale(lerp(bandTop, bandBot, tRow), body);
			const fillWidth = halfWidth * fillFrac;
			const cols = Math.max(1, Math.round(fillWidth / spacing));

			for (let c = 0; c < cols; c++) {
				const u = (c + rand(0.1, 0.9)) / cols;
				const px = body.cx + side * (halfWidth - u * fillWidth);
				const py = rowY + rand(-0.02, 0.02) * body.ry;

				const len = featherLen * sizeScale * rand(0.85, 1.15);
				if (len < 2) continue;

				const angle =
					featherAngle(px, py, body) + rand(-8, 8) * (Math.PI / 180) + outwardTurn;
				drawRotatedEllipse(rc, ctx, px, py, len, Math.max(2, len * 0.4), angle, FEATHER);
			}
		}
	}
}

/**
 * Renders rough, pencil-like owl sketches into `canvas`, using the user's
 * circles as a guide. Circles that overlap (or nearly touch) are merged into a
 * single owl with a smooth metaball outline; circles further apart become their
 * own owls. Within an owl the smaller circle is the head and the larger the
 * body, and a single facing value (−1…1) smoothly drives eyes, beak, feet, and
 * feathers toward profile — hiding the far side entirely at ±1.
 */
export function pencilfyOwl(canvas: HTMLCanvasElement, circles: OwlCircle[]): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	if (circles.length === 0) return;

	const rc = rough.canvas(canvas);

	for (const group of groupOwls(circles)) {
		const { head, body } = classify(group);
		const face = computeFacing(head, body);

		drawOutline(rc, group);
		drawFeathers(rc, ctx, body, face);
		drawFeet(rc, body, face, canvas.width);
		drawEyes(rc, head, face);
		drawBeak(rc, head, face);
	}
}
