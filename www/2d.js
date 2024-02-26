/*

	Math for undirected planar graphs.
	Written by Cosmin Apreutesei. Public Domain.

	plane_graph(e) -> e

		ps -> [p1,...]
		segs -> [[s1p1,s1p2],...]
		comps -> [comp1,...]
		root_comps -> [comp1,...]

		init()
		fix()

		hit_cycles(x, y) -> cycle|null


*/

(function() {
"use strict"
const G = window

// utilities -----------------------------------------------------------------

const {
	inf,
	mod,
} = glue

const {
	v2,
} = Math3D

let v2_near = v2.near

let next_id = 1
function gen_id() { return next_id++ } // stub

// cycle base extaction algorihm ---------------------------------------------
//
// - input: single component of a simple undirected plane graph. no zero-length
// segments, overlapping or intersecting segments allowed. all points and segments
// must be connected.
// - points can be end-points (#adj=1), joints (#adj=2) or branch points (#adj > 2).
// - output: all minimal base cycles (i.e. cycle base) with filaments included.
//
// Paper : https://www.geometrictools.com/Documentation/MinimalCycleBasis.pdf
// Code  : https://github.com/vbichkovsky/min-cycles/blob/master/src/cycles.js
//

function rem_edge(p1, p2, ps) {
	remove_value(p1.adj, p2)
	remove_value(p2.adj, p1)
	if (p1.adj == 0) remove_value(ps, p1)
	if (p2.adj == 0) remove_value(ps, p2)
}

function rem_filament(p, ps) {
	while (p && p.adj.length < 2) {
		remove_value(ps, p)
		let pa = p.adj[0]
		if (pa)
			rem_edge(p, pa, ps)
		p = pa
	}
}

function is_cw(ps) {
	let s = 0
	for (let i = 0, n = ps.length; i < n; i++) {
		let [x1, y1] = ps[mod(i-1, n)]
		let [x2, y2] = ps[i]
		s += (x2-x1)*(y2+y1)
	}
	return s < 0
}

function left_bottom_point(ps) {
	return ps.reduce((p0, p1) => {
		let x1 = p1[0]
		let x0 = p0[0]
		if (x1 < x0) return p1
		if (x0 < x1) return p0
		let y1 = p1[1]
		let y0 = p0[1]
		if (y1 > y0) return p1
		return p0
	})
}

// return a number from the range [0..4) which is monotonically increasing
// with the clockwise angle that the input vector makes against the x axis.
// Useful when the actual angle is not needed eg. when comparing angles
// or for finding the quadrant of an angle.
// NOTE: One branch miss (20cy) + one division (4cy) is still faster than atan2 (100cy).
// Then again, one cache miss is 100cy so this does not have a big impact.
function pseudo_angle(dx, dy) {
	let p = dx / (abs(dx) + abs(dy))  // -1..0 (x <= 0) or 0..1 (x >= 0)
	return dy < 0 ? 3 + p : 1 - p     //  2..4 (y <= 0) or 0..2 (y >= 0)
}

// return the angle sweep from angle a1 to a2 in cw (+) or ccw (-) dir.
function angle_sweep(a1, a2, clockwise, circle_sweep) {
	circle_sweep ??= 4
	let d = a2 - a1
	if (d < 0 && clockwise)
		d += circle_sweep
	else if (d > 0 && !clockwise)
		d -= circle_sweep
	return d
}

function points_colinear(p0, p1, p2) {
	return near_angle(
		pseudo_angle(p1[0] - p0[0], p1[1] - p0[1]),
		pseudo_angle(p2[0] - p1[0], p2[1] - p1[1])
	)
}

// return p1 from p.adj where the angle at p on (p0,p,p1) is smallest in cw or ccw direction.
function next_adj(p0, p, clockwise, max_a) {
	max_a ??= inf
	if (p.adj.length == 1 && max_a >= 2) // end-point, go back (or forward if first)
		return p.adj[0]
	let x0 = p0 ? p0[0] - p[0] : 0
	let y0 = p0 ? p0[1] - p[1] : 1
	let a0 = pseudo_angle(x0, y0)
	let min_a = inf // min angle
	let min_p // point with min angle to (p0,p)
	for (let p1 of p.adj) {
		if (p1 == p0)
			continue
		let x1 = p1[0] - p[0]
		let y1 = p1[1] - p[1]
		let a1 = pseudo_angle(x1, y1)
		let a = abs(angle_sweep(a1, a0, clockwise))
		if (a < min_a && a <= max_a) {
			min_a = a
			min_p = p1
		}
	}
	return min_p
}

function poly_get_point(i, out) {
	out[0] = this[i][0]
	out[1] = this[i][1]
	return out
}

function closed_walk(first, outer_cycle) {
	let walk = poly()
	walk.get_point = poly_get_point
	let curr = first
	let prev
	do {
		walk.push(curr)
		let next = next_adj(prev, curr, !prev || outer_cycle)
		prev = curr
		curr = next
		if (curr == first) {
			if (outer_cycle) {
				// when tracing the outer cycle is not enough to stop when the
				// starting point is encountered since multiple outer cycles can
				// meet at the starting point (connected with filaments or not).
				let next = next_adj(prev, curr, true)
				if (next == walk[1])
					break
			} else {
				break // filament check done later on inner cycles
			}
		}
	} while (1)
	return walk
}

function extract_cycles_for(comp, init_cycle) {
	let ps = [...comp.ps]
	while (ps.length > 0) {
		let p = left_bottom_point(ps)
		let c = closed_walk(p)
		if (c[1] != c[c.length-1]) { // not started with a filament
			c.comp = comp
			comp.cycles.push(c)
			init_cycle(c)
		}
		// the first edge is always safe to remove because starting from the leftmost
		// point means that there cannot be a cycle to the right of that first edge
		// so that edge is part of at most one cycle: our cycle.
		rem_edge(c[0], c[1], ps)
		// the removed edge's end-points are now possibly end-points of filaments
		// that we must remove too.
		rem_filament(c[0], ps)
		rem_filament(c[1], ps)
	}
}

function extract_outer_cycle_for(comp, init_cycle) {
	let p = left_bottom_point(comp.ps)
	let c = closed_walk(p, true)
	c.reverse() // outer cycle must go clockwise
	c.outer = true
	c.comp = comp
	comp.cycles.push(c)
	comp.outer_cycle = c
	init_cycle(c)
}

// house plan model utils ----------------------------------------------------

function line_middle(p1, p2) {
	let [x1, y1] = p1
	let [x2, y2] = p2
	return [
		(x2 + x1) / 2,
		(y2 + y1) / 2,
	]
}

function is_v(seg) { return seg[0][0] == seg[1][0] }

function seg_x1(seg) { return min(seg[0][0], seg[1][0]) }
function seg_y1(seg) { return min(seg[0][1], seg[1][1]) }
function seg_x2(seg) { return max(seg[0][0], seg[1][0]) }
function seg_y2(seg) { return max(seg[0][1], seg[1][1]) }

function set_seg_x1(seg, x) { let x1i = seg[0][0] < seg[1][0] ? 0 : 1; seg[x1i][0] = x }
function set_seg_y1(seg, y) { let y1i = seg[0][1] < seg[1][1] ? 0 : 1; seg[y1i][1] = y }
function set_seg_x2(seg, x) { let x2i = seg[0][0] < seg[1][0] ? 1 : 0; seg[x2i][0] = x }
function set_seg_y2(seg, y) { let y2i = seg[0][1] < seg[1][1] ? 1 : 0; seg[y2i][1] = y }

function seg_axis(seg) { return is_v(seg) ? seg_x1(seg) : seg_y1(seg) }
function seg_m1  (seg) { return is_v(seg) ? seg_y1(seg) : seg_x1(seg) }
function seg_m2  (seg) { return is_v(seg) ? seg_y2(seg) : seg_x2(seg) }

function set_seg_m1  (seg, m) { if (is_v(seg)) set_seg_y1(seg, m); else set_seg_x1(seg, m) }
function set_seg_m2  (seg, m) { if (is_v(seg)) set_seg_y2(seg, m); else set_seg_x2(seg, m) }
function set_seg_axis(seg, a) {
	if (is_v(seg)) {
		seg[0][0] = a
		seg[1][0] = a
	} else {
		seg[0][1] = a
		seg[1][1] = a
	}
}

function seg_pi(seg, p) {
	assert(seg[0] == p || seg[1] == p)
	return seg[0] == p ? 0 : 1
}

function seg_i1(seg) { let mi = is_v(seg) ? 1 : 0; return seg[0][mi] < seg[1][mi] ? 0 : 1 }
function seg_i2(seg) { let mi = is_v(seg) ? 1 : 0; return seg[0][mi] < seg[1][mi] ? 1 : 0 }

function seg_p1(seg) { return seg[seg_i1(seg)] }
function seg_p2(seg) { return seg[seg_i2(seg)] }

function seg_center(seg) {
	return line_middle(seg[0], seg[1])
}

// plane graph class ---------------------------------------------------------

let point_freelist = freelist(function() {
	let p = [0, 0]
	p.segs = []
	p.adj = []
	return p
})

let seg_freelist = freelist(function() {
	let seg = [null, null]
	return seg
})

function plane_graph(e) {

	e.ps = []
	e.segs = []
	e.comps = []
	e.root_comps = []

	let gen_id = e.gen_id ?? gen_id
	let ps = e.ps
	let ps_ids = map()
	let segs = e.segs
	let comps = e.comps
	let root_comps = e.root_comps

	function rebuild_adj_refs() {
		for (let p of ps)
			p.adj.length = 0
		for (let p of ps)
			for (let seg of p.segs)
				p.adj.push(seg[1-seg_pi(seg, p)])
	}

	e.next_adj = next_adj

	// model editing -------------------------------------------------------

	let p = point_freelist.alloc()

	function add_point(x, y, id) {
		let p = point_freelist.alloc()
		p[0] = x
		p[1] = y
		p.i = id ?? gen_id('point')
		ps_ids.set(p.i, p)
		ps.push(p)
		log('point added:', p.i, ':', x, y)
		return p
	}
	e.add_point = add_point

	function rem_points(cond, msg) {
		let a = []
		remove_values(ps, function(p) {
			if (!cond(p))
				return
			a.push(p.i)
			ps_ids.delete(p.i)
			p.adj.length = 0
			p.segs.length = 0
			point_freelist.free(p)
			return true
		})
		if (a.length)
			log(msg ?? 'points', 'removed:', ...a)
	}

	function add_seg_refs(seg) {
		seg[0].segs.push(seg)
		seg[1].segs.push(seg)
		seg[0].adj.push(seg[1])
		seg[1].adj.push(seg[0])
	}

	function add_seg(p1, p2, id) {
		let seg = seg_freelist.alloc()
		seg[0] = p1
		seg[1] = p2
		seg.i = id ?? gen_id('seg')
		segs.push(seg)
		add_seg_refs(seg)
		log('seg added:', seg.i, ':', seg[0].i, seg[1].i)
		return seg
	}
	e.add_seg = add_seg

	function rem_seg_refs(seg) {
		remove_value(seg[0].segs, seg)
		remove_value(seg[1].segs, seg)
		remove_value(seg[0].adj, seg[1])
		remove_value(seg[1].adj, seg[0])
		seg[0] = null
		seg[1] = null
		seg_freelist.free(seg)
		log('seg removed:', seg.i)
	}

	function rem_seg(seg) {
		rem_seg_refs(seg)
		remove_value(segs, seg)
	}

	function rem_segs(cond, msg) {
		let a = []
		remove_values(segs, function(seg) {
			if (!cond(seg)) return
			a.push(seg.i)
			rem_seg_refs(seg)
			return true
		})
		if (log && a.length)
			log(msg ?? 'segs', 'removed:', ...a)
	}

	function rem_marked_segs(msg) {
		rem_segs(seg => seg.removed, msg)
	}

	function set_seg_point(seg, i, p) {
		let old_p = seg[i]
		let other_p = seg[1-i]
		remove_value(old_p.segs, seg)
		p.segs.push(seg)
		replace_value(other_p.adj, old_p, p)
		remove_value(old_p.adj, other_p)
		p.adj.push(other_p)
		seg[i] = p
		log('seg end moved:', seg.i, '/', i, ':', old_p.i, '->', p.i)
		return old_p
	}
	e.set_seg_point = set_seg_point

	// model loading ----------------------------------------------------------

	function add_json_point(p) { // [x,y[,id]] | {x:, y:, i: id}
		if (isarray(p))
			return add_point(p[0], p[1], p[2])
		else if (isobj(p))
			return add_point(p.x, p.y, p.i)
		else
			check(false, 'invalid point', p)
	}

	function point_ref(p) { // idx | id | json_point
		if (isnum(p))
			return check(ps[p], 'invalid point index', p)
		else if (isstr(p))
			return check(ps_ids.get(p), 'invalid point id', p, '('+typeof p+')')
		else
			return add_json_point(p)
	}
	e.point_ref = point_ref

	function add_segs(a) {
		if (isstr(a))
			a = words(a)
		if (a[0] == 'draw') { // ['draw', [id, ]x0, y0, [id, ]d-to-right, [id, ]d-to-down, [id, ]d-to-right, ...]
			let x0, p0, id
			let i = 0
			let n = a.length
			let sx = 1 // horizontal first
			let sy = 0
			while (i < a.length) {
				let m = a[i]
				if (isstr(m))
					id = m
				else if (x0 == null) {
					x0 = m
				} else if (p0 == null) {
					p0 = add_point(x0, m, id)
					id = null
				} else {
					if (m) { // 0 means skip so we can change direction back
						let x = p0[0] + m * sx
						let y = p0[1] + m * sy
						let p = add_point(x, y, id)
						id = null
						add_seg(p0, p)
						p0 = p
					}
					sx = 1-sx
					sy = 1-sy
				}
				i++
			}
		} else if (a[0] == 'connect') { // ['connect', p1, p2, ...]
			let p0 = point_ref(a[1])
			for (let i = 2, n = a.length; i < n; i++) {
				let p1 = point_ref(a[i])
				if (p0 && p1)
					add_seg(p0, p1)
				p0 = p1
			}
		} else if (isarray(a[0])) { // [[seg_id, ]p1, p2, ...]
			let i = 0
			let n = a.length
			let id, p1
			while (i < n) {
				let p = a[i]
				if (isstr(p)) {
					id = p
				} else if (!p1) {
					p1 = point_ref(p)
				} else {
					let p2 = point_ref(p)
					add_seg(p1, p2, id)
					p1 = null
					p2 = null
					id = null
				}
				i++
			}
		}
	}

	// model fixing --------------------------------------------------------

	function remove_isolated_points() {
		rem_points(p => p.adj.length == 0, 'isolated points')
	}

	function remove_null_segs() {
		rem_segs(seg => v2_near(seg[0], seg[1]), 'null segs')
	}

	function remove_angled_segs() {
		if (!e.orthogonal)
			return
		rem_segs(seg => seg[0][0] != seg[1][0] && seg[0][1] != seg[1][1], 'angled segs')
	}

	// NOTE: assumes segs are sorted, null segs removed, points deduplicated.
	function merge_colinear_segs() {
		for (let p of ps) {
			if (p.adj.length == 2) {
				let p0 = p.adj[0]
				let p2 = p.adj[1]
				if (points_colinear(p0, p, p2)) {

					let s1 = p.segs[0]
					let s2 = p.segs[1]
					let s1_pi = seg_pi(s1, p)
					let s2_p2 = s2[1-seg_pi(s2, p)]
					push_log('merging segs:', s1.i, '+', s2.i, '=>', s1.i)
					set_seg_point(s1, s1_pi, s2_p2)
					rem_seg(s2)

					pop_log()
				}
			}
		}
	}

	// shortens seg at m with new point and adds new seg without detaching the original seg's end-points.
	// TODO: generalize to angled segs.
	function split_seg_at(seg, m) {
		push_log('seg split:', seg.i, '@', m)
		let m1 = seg_m1(seg)
		let m2 = seg_m2(seg)
		let x = is_v(seg) ? seg_x1(seg) : m
		let y = is_v(seg) ? m : seg_y1(seg)
		let new_p = add_point(x, y)
		let old_p = set_seg_point(seg, seg_i2(seg), new_p)
		let new_seg = add_seg(new_p, old_p)
		pop_log()
	}

	// TODO: generalize to angled segs.
	function split_intersecting_segs_on(v) {
		push_log('split all intersecting segs')
		for (let seg1 of segs) {
			if (is_v(seg1) == v) {
				for (let seg2 of segs) {
					if (is_v(seg2) != v) {
						let m1  = seg_m1(seg1)
						let m2  = seg_m2(seg1)
						let bm1 = seg_m1(seg2)
						let bm2 = seg_m2(seg2)
						let a   = seg_axis(seg1)
						let ba  = seg_axis(seg2)
						if (bm1 <= a && bm2 >= a && ba > m1 && ba < m2) {
							// splitting adds a seg at the end of segs array which will
							// be also tested in the outer loop and possibly split further.
							// the shortened seg is potentially split multiple times
							// in this inner loop.
							split_seg_at(seg1, ba)
						}
					}
				}
			}
		}
		pop_log()
	}
	function split_intersecting_segs() {
		split_intersecting_segs_on(0)
		split_intersecting_segs_on(1)
	}

	// NOTE: leaves isolated points behind.
	function points_cmp(p1, p2) {
		let dx = p1[0] - p2[0]; if (dx) return dx
		let dy = p1[1] - p2[1]; if (dy) return dy
		return p1.i - p2.i
	}
	function deduplicate_points() {
		push_log('deduplicate all points')
		ps.sort(points_cmp)
		let p0
		for (let i = 0; i < ps.length; i++) {
			let p = ps[i]
			if (p0 && v2_near(p, p0)) {
				for (let j = 0; j < p.segs.length; j++) { // each connected seg
					let seg = p.segs[j]
					for (let i = 0; i < 2; i++) // each seg end
						if (seg[i] == p) {
							set_seg_point(seg, i, p0, 'seg end point dedup')
							j-- // because seg was just removed from p.segs
						}
				}
				continue
			}
			p0 = p
		}
		pop_log()
	}

	// TODO: generalize to angled segs.
	// NOTE: requires no intersecting segments.
	function break_overlapping_segs() {
		push_log('breaking overlapping colinear segs')
		segs.sort(function(s1, s2) {
			// level 1 grouping by direction
			let v1 = is_v(s1)
			let v2 = is_v(s2)
			let dv = v1 - v2
			if (dv) return dv
			// level 2 grouping by axis
			let m1 = seg_axis(s1)
			let m2 = seg_axis(s2)
			let dm = m1 - m2
			if (dm) return dm
			// level 3 grouping by starting point because most segments are
			// non-overlapping and we want to skip those quickly.
			let i = v1 ? 1 : 0
			let c1 = min(s1[0][i], s1[1][i])
			let c2 = min(s2[0][i], s2[1][i])
			return c1 - c2
		})
		let i0, v0, m0
		for (let i = 0, n = segs.length; i <= n; i++) {
			let seg = segs[i]
			let v = seg ? is_v(seg) : null
			let m = seg ? seg_axis(seg) : null
			if (v0 == null) {
				i0 = i
				v0 = v
				m0 = m
			} else if (v != v0 || m != m0) {
				if (i >= i0 + 2) { // there's at least 2 segments on this axis
					for (let j = i0+1; j < i; j++) {
						let seg1 = segs[j]
						let seg0 = segs[j-1]
						let m1_1 = seg_m1(seg1)
						let m2_0 = seg_m2(seg0)
						if (m1_1 < m2_0) {
							// seg points that are overlapping segs have no _|_ joints
							// or they wouldn't be overlapping the seg, so it's safe
							// to remove the overlapping seg as long as we elongate
							// the overlapped seg.
							log('segs overlap:', seg0.i, seg1.i, ':', m1_1, '<=', m2_0,
								'; seg removed:', seg1.i, '; seg', seg0.i, '.m2 set to:', seg_m2(seg1))
							seg1.removed = true
							set_seg_m2(seg0, max(seg_m2(seg1), seg_m2(seg0)))
						}
					}
				}
				i0 = i
				v0 = v
				m0 = m
			}
		}
		rem_marked_segs()
		pop_log()
	}

	// finding graph components --------------------------------------------

	function add_comp() {
		let comp = {}
		comp.i = gen_id('comp')
		comp.ps = []
		comp.cycles = []
		comp.segs = []
		comp.islands = []
		comps.push(comp)
		return comp
	}

	// NOTE: needs adj refs
	function find_comps() {

		for (let p of ps)
			p.visited = false

		comps.length = 0

		function dfs(p, ps, segs) {
			p.visited = true
			ps.push(p)
			for (let seg of p.segs)
				segs.add(seg)
			for (p of p.adj)
				if (!p.visited)
					dfs(p, ps, segs)
		}

		for (let p of ps) {
			if (!p.visited) {
				let comp = add_comp()
				let segs = set()
				dfs(p, comp.ps, segs)
				comp.segs = set_toarray(segs)
				log('comp:', comp.i, ':', comp.i, ...comp.ps.map(p=>p.i))
			}
		}

	}

	// finding which components are inside islands ----------------------------

	function is_comp_inside_poly(c, poly) { // comp inside poly check
		if (!c.bb.inside_bbox2(...poly.bbox()))
			return false
		return poly.hit(c.ps[0][0], c.ps[0][1])
	}

	function is_comp_inside_comp(c, p) { // comp inside comp check
		return is_comp_inside_poly(c, p.outer_cycle)
	}

	function is_comp_inside_cycle(co, cy) { // comp inside cycle check
		return is_comp_inside_poly(co, cy, cy.bbox())
	}

	// NOTE: O(n^2)
	function is_comp_directly_inside_comp(c, p) { // comp directly inside comp check
		if (!is_comp_inside_comp(c, p))
			return false
		for (let q of comps)
			if (q != c && q != p && q.inside && is_comp_inside_comp(c, q) && is_comp_inside_comp(q, p))
				return false
		return true
	}

	function find_inside_comps() {

		// point-based bbox: enough for computing inside flag.
		for (let c of comps) {
			c.inside = false
			c.parent = null
			c.islands.length = 0
			c.bb = bbox2()
			for (let cy of c.cycles)
				c.bb.add_bbox2(...cy.bbox())
		}

		// set inside flag with O(n^2) in order to lower the n for the O(n^4) loop below.
		root_comps.length = 0
		for (let c of comps) {
			for (let p of comps) {
				if (p != c && is_comp_inside_comp(c, p)) {
					c.inside = true
					break
				}
			}
			if (!c.inside)
				root_comps.push(c)
		}

		// NOTE: O(n^4) but only checks islands which should be rare.
		for (let c of comps) {
			if (!c.inside)
				continue
			for (let p of comps) {
				if (p != c && is_comp_directly_inside_comp(c, p)) {
					c.parent = p
					p.islands.push(c)
				}
			}
		}

		// assign islands to inner cycles.
		for (let comp of comps) {
			for (let cycle of comp.cycles) {
				if (cycle.outer)
					continue
				cycle.islands = []
				for (let icomp of comp.islands) {
					if (is_comp_inside_cycle(icomp, cycle)) {
						cycle.islands.push(icomp)
						log('comp', icomp.i, 'is inside comp', comp.i, 'cycle', cycle.i)
					}
				}
			}
		}

	}

	// finding the cycle base -------------------------------------------------

	function init_cycle(c) {
		c.i = gen_id('cycle')
		c.area_pos = [...c.center()]
	}

	function extract_cycles() {

		for (let c of comps)
			c.cycles.length = 0

		for (let c of comps)
			extract_outer_cycle_for(c, init_cycle)
		rebuild_adj_refs()

		for (let c of comps)
			extract_cycles_for(c, init_cycle)
		rebuild_adj_refs()

		if (1)
		for (let co of comps)
			for (let c of co.cycles)
				log('cycle', co.i, '/', c.i,
					is_cw(c) ? 'cw' : 'ccw',
					c.outer ? 'outer' : '',
					c.inside ? 'inside' : '',
					':', ...c.map(p=>p.i)
				)
	}

	// hit testing ------------------------------------------------------------

	function hit_cycle(x, y, c) {
		if (c.outer)
			return
		if (!c.edges.bbox().hit(x, y))
			return
		for (let icomp of c.islands) {
			for (let c1 of icomp.cycles) {
				let c2 = hit_cycle(x, y, c1)
				if (c2)
					return c2
			}
		}
		if (!c.edges.hit(x, y))
			return
		return c
	}
	function hit_cycles(x, y) {
		for (let co of comps) {
			for (let c of co.cycles) {
				let hit_c = hit_cycle(x, y, c)
				if (hit_c)
					return hit_c
			}
		}
	}
	e.hit_cycles = hit_cycles

	// plan loading & validation -------------------------------------------

	e.after_fix = noop
	function fix() {
		split_intersecting_segs()
		break_overlapping_segs()
		remove_null_segs()
		deduplicate_points()
		rebuild_adj_refs()
		merge_colinear_segs()
		remove_isolated_points()
		find_comps()
		extract_cycles()
		find_inside_comps()
		e.after_fix()
	}
	e.fix = fix

	// init -------------------------------------------------------------------

	function init() {

		if (e.points)
			for (let p of e.points)
				add_json_point(p)

		if (e.lines)
			for (let a of e.lines)
				add_segs(a)

		remove_angled_segs()

	}
	e.init = init

	return e
}

// publishing ----------------------------------------------------------------

G.plane_graph = plane_graph

}()) // module scope.
