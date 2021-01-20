/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

(function() {

// precision settings --------------------------------------------------------

let MIND   = 0.001        // min line distance
let MAXD   = 1e4          // max model total distance
let MAXSD  = 0.03 ** 2    // max distance^2 for snapping
let MAXISD = 0.00001 ** 2 // max distance^2 for intersections

// primitive construction ----------------------------------------------------

function v2(x, y)      { return new THREE.Vector2(x, y) }
function v3(x, y, z)   { return new THREE.Vector3(x, y, z) }
function line3(p1, p2) { return new THREE.Line3(p1, p2) }
function color(c)      { return new THREE.Color(c) }

// region-finding algorithm --------------------------------------------------

// The algorithm below is O(n log n) and it's from the paper:
//   "An optimal algorithm for extracting the regions of a plane graph"
//   X.Y. Jiang and H. Bunke, 1992.

// return a number from the range [0..4] which is monotonic
// in the angle that the input vector makes against the x axis.
function v2_pseudo_angle(dx, dy) {
	let p = dx / (abs(dx) + abs(dy))  // -1..1 increasing with x
	return dy < 0 ? 3 + p : 1 - p     //  2..4 or 0..2 increasing with x
}

function plane_regions(plane_normal, get_point, lines) {

	// phase 1: find all wedges.

	// step 1+2: make pairs of directed edges from all the edges and compute
	// their angle-to-horizontal so that they can be then sorted by that angle.
	let edges = [] // [[p1i, p2i, angle], ...]
	let n = lines.length / 2
	let p1 = v3()
	let p2 = v3()
	for (let i = 0; i < n; i++) {
		let p1i = lines[2*i+0]
		let p2i = lines[2*i+1]
		get_point(p1i, p1).projectOnPlane(plane_normal)
		get_point(p2i, p2).projectOnPlane(plane_normal)
		edges.push(
			[p1i, p2i, v2_pseudo_angle(p2.x - p1.x, p2.y - p1.y)],
			[p2i, p1i, v2_pseudo_angle(p1.x - p2.x, p1.y - p2.y)])
	}

	// step 3: sort by edges by (p1, angle).
	edges.sort(function(e1, e2) {
		if (e1[0] == e2[0])
			return e1[2] < e2[2] ? -1 : (e1[2] > e2[2] ? 1 : 0)
		else
			return e1[0] < e2[0] ? -1 : 1
	})

	// for (let e of edges) { print('e', e[0]+1, e[1]+1) }

	// step 4: make wedges from edge groups formed by edges with the same p1.
	let wedges = [] // [[p1i, p2i, p3i, used], ...]
	let wedges_first_pi = edges[0][1]
	for (let i = 0; i < edges.length; i++) {
		let edge = edges[i]
		let next_edge = edges[i+1]
		let same_group = next_edge && edge[0] == next_edge[0]
		if (same_group) {
			wedges.push([edge[1], edge[0], next_edge[1], false])
		} else {
			wedges.push([edge[1], edge[0], wedges_first_pi, false])
			wedges_first_pi = next_edge && next_edge[1]
		}
	}

	// for (let w of wedges) { print('w', w[0]+1, w[1]+1, w[2]+1) }

	// phase 2: group wedges into regions.

	// step 1: sort wedges by (p1, p2) so we can binsearch them by the same key.
	wedges.sort(function(w1, w2) {
		if (w1[0] == w2[0])
			return w1[1] < w2[1] ? -1 : (w1[1] > w2[1] ? 1 : 0)
		else
			return w1[0] < w2[0] ? -1 : 1
	})

	// for (let w of wedges) { print('w', w[0]+1, w[1]+1, w[2]+1) }

	// step 2: mark all wedges as unused (already did on construction).
	// step 3, 4, 5: find contiguous wedges and group them into regions.
	// NOTE: the result also contans the outer region which goes clockwise
	// while inner regions go anti-clockwise.
	let regions = [] // [[p1i, p2i, ...], ...]
	let k = [0, 0] // reusable (p1i, p2i) key for binsearch.
	function cmp_wedges(w1, w2) { // binsearch comparator on wedge's (p1i, p2i).
		return w1[0] == w2[0] ? w1[1] < w2[1] : w1[0] < w2[0]
	}
	for (let i = 0; i < wedges.length; i++) {
		let w0 = wedges[i]
		if (w0[3])
			continue // skip wedges marked used
		region = [w0[1]]
		regions.push(region)
		k[0] = w0[1]
		k[1] = w0[2]
		while (1) {
			let i = wedges.binsearch(k, cmp_wedges)
			let w = wedges[i]
			region.push(w[1])
			w[3] = true // mark used so we can skip it
			if (w[1] == w0[0] && w[2] == w0[1]) // cycle complete.
				break
			k[0] = w[1]
			k[1] = w[2]
		}
	}

	// for (let r of regions) { print('r', r.map(i => i+1)) }

	return regions
}

function test_plane_regions() {
	let points = [
		v3(0, -5, 0),
		v3(-10, 0, 0), v3(10, 0, 0), v3(-10, 5, 0), v3(10, 5, 0),
		//v3(-5, 1, 0), v3(5,  1, 0), v3(-5, 4, 0), v3(5, 4, 0),
		//v3(0, -1, 0), v3(1, -2, 0),
	]
	let get_point = function(i, out) { out.copy(points[i]); return out }
	let lines  = [0,1, 0,2,  1,2, 1,3, 2,4, 3,4,  ] // 5,6, 5,7, 6,8, 7,8,  0,9, 9,10]
	let rt = plane_regions(v3(0, 0, 1), get_point, lines)
	for (let r of rt) { print(r.map(i => i+1)) }
}
test_plane_regions()

// line-line-intersection ----------------------------------------------------

// returns the smallest line that connects two lines, be they coplanar or skewed.
function line_to_line_intersection(lp, lq, clamp, out_line) {

	let p = lp.start
	let q = lq.start
	let mp = lp.delta()
	let mq = lq.delta()
	var qp = p.clone().sub(q)

	var qp_mp = qp.dot(mp)
	var qp_mq = qp.dot(mq)
	var mp_mp = mp.dot(mp)
	var mq_mq = mq.dot(mq)
	var mp_mq = mp.dot(mq)

	var detp = qp_mp * mq_mq - qp_mq * mp_mq
	var detq = qp_mp * mp_mq - qp_mq * mp_mp
	var detm = mp_mq * mp_mq - mq_mq * mp_mp

	if (detm == 0) // lines are parallel
		return

	let rp = p.clone().add(mp.multiplyScalar(detp / detm))
	let rq = q.clone().add(mq.multiplyScalar(detq / detm))
	if (clamp) {
		let p1 = v3()
		let p2 = v3()
		p1.copy(lp.end).sub(lp.start)
		p2.copy(rp).sub(lp.start)
		let tp = p2.length() / p1.length() * (p1.dot(p2) > 0 ? 1 : -1)
		p1.copy(lq.end).sub(lq.start)
		p2.copy(rq).sub(lq.start)
		let tq = p2.length() / p1.length() * (p1.dot(p2) > 0 ? 1 : -1)
		if (tp < 0)
			rp.copy(lp.start)
		else if (tp > 1)
			rp.copy(lp.end)
		if (tq < 0)
			rq.copy(lq.start)
		else if (tq > 1)
			rq.copy(lq.end)
	}

	if (out_line) {
		out_line.start = rp
		out_line.end   = rq
	} else {
		out_line = line3(rp, rq)
	}

	return out_line
}

print(line_to_line_intersection(line3(v3(0, 0, 0), v3(1, 0, 0)), line3(v3(0, 1, 0), v3(1, 1, 0))))

/*
	// alt. impl using cross vectors

	let qp = v3().subVectors(p, q)
	let pq = qp.clone().multiplyScalar(-1)

	let npq = v3().crossVectors(mp, mq).normalize()
	let nqp = v3().crossVectors(mq, mp).normalize()

	let n1 = v3().crossVectors(mp, nqp).normalize()
	let n2 = v3().crossVectors(mq, npq).normalize()

	let qpDotn1 = qp.dot(n1)
	let pqDotn2 = pq.dot(n2)

	let mpDotn2 = mp.dot(n2)
	let mqDotn1 = mq.dot(n1)

	let p1 = p.clone().add(mp.clone().multiplyScalar(pqDotn2 / mpDotn2))
	let p2 = q.clone().add(mq.clone().multiplyScalar(qpDotn1 / mqDotn1))

*/

// editable polygon meshes ---------------------------------------------------

// Polygon meshes are lists of polygons enclosed and connected by lines
// defined over a common point cloud.

// The editing API implements the direct manipulation UI and is designed to
// perform automatic creation/removal/intersection of points/lines/polygons
// while keeping the model numerically stable and clean. In particular:
// - editing operations never leave duplicate points/lines/polygons.
// - existing points are never moved when adding new geometry.
// - when existing lines are cut, straightness is preserved to best accuracy.

function material_db() {

	let e = {}

	e.get_color = function(color) {

	}

	return e
}

function triangle_plane_normal(p1, p2, p3) {
	p2.sub(p1)
	p3.sub(p1)
	p2.cross(p3)
	p2.normalize()
	return p2.length() > .5 ? p2 : null
}

function poly_mesh(e) {

	e = e || {}

	e.point_coords = [] // [p1x, p1y, p1z, p2x, ...]
	e.line_pis = [] // [l1p1i, l1p2i, l2p1i, l2p2i, ...]
	e.polys = [] // [[material_id: mi, plane_normal: p, triangle_pis: [t1p1i, ...], p1i, p2i, ...], ...]

	e.points_len = () => e.point_coords.length / 3
	e.lines_len = () => e.line_pis.length / 2

	e.get_point = function(i, out) {
		out = out || v3()
		out.x = e.point_coords[3*i+0]
		out.y = e.point_coords[3*i+1]
		out.z = e.point_coords[3*i+2]
		out.i = i
		return out
	}

	e.get_line = function(i, out) {
		let p1i = e.line_pis[2*i+0]
		let p2i = e.line_pis[2*i+1]
		out = out || line3()
		e.get_point(p1i, out.start)
		e.get_point(p2i, out.end)
		out.i = i
		return out
	}

	function poly_plane_normal(poly) {
		if (!poly.plane_normal) {
			assert(poly.length >= 3)
			let p1 = v3()
			let p2 = v3()
			let p3 = v3()
			for (let i = 2; i < poly.length; i++) {
				e.get_point(poly[0], p1)
				e.get_point(poly[1], p2)
				e.get_point(poly[i], p3)
				poly.plane_normal = triangle_plane_normal(p1, p2, p3)
				if (poly.plane_normal)
					break
			}
		}
		return poly.plane_normal
	}

	// length of output index array is always: 3 * (poly.length - 2).
	function triangulate_poly(poly) {
		if (!poly.triangle_pis) {
			let plane_normal = poly_plane_normal()
			let ps = []
			let p = v3()
			for (let pi of poly) {
				let x = e.get_point(pi, p).projectOnPlane(plane_normal).x
				let y = e.get_point(pi, p).projectOnPlane(plane_normal).y
				ps.push(x, y)
			}
			let pis = Earcut.triangulate(ps, null, 2)
			for (let i = 0; i < pis.length; i++)
				pis[i] = e.poly[pis[i]]
			poly.triangle_pis	= pis
		}
	}

	// hit-testing

	// return the closest point to target point with the point index in p.i.
	e.point_hit_points = function(target_p, max_sd, f) {
		let min_sd = 1/0
		let min_p
		let p = v3()
		for (let i = 0, len = e.points_len(); i < len; i++) {
			let sd = e.get_point(i, p).distanceToSquared(target_p)
			if (sd <= max_sd) {
				if (f)
					f(p, sd)
				if (sd < min_sd) {
					min_sd = sd
					min_p = min_p || v3()
					min_p.copy(p)
					min_p.i = i
				}
			}
		}
		return min_p
	}

	// return the line from target line to its closest point
	// with the point index in line.end.i.
	e.line_hit_points = function(target_line, max_sd, f) {
		let min_sd = 1/0
		let int_line = line3()
		let min_int_line
		let p1 = int_line.start
		let p2 = int_line.end
		let i1 = target_line.start.i
		let i2 = target_line.end.i
		for (let i = 0, len = e.points_len(); i < len; i++) {
			if (i == i1 || i == i2) // don't hit target line's points
				continue
			e.get_point(i, p2)
			target_line.closestPointToPoint(p2, true, p1)
			let sd = p1.distanceToSquared(p2)
			if (sd <= max_sd) {
				//p1.t = target_line.closestPointToPointParameter(p2, true)
				if (f)
					f(int_line, sd)
				if (sd < min_sd) {
					min_sd = sd
					min_int_line = min_int_line || line3()
					min_int_line.start.copy(p1)
					min_int_line.end.copy(p2)
					min_int_line.end.i = i
					//min_int_line.start.t = p1.t
				}
			}
		}
		return min_int_line
	}

	// return the line from target point to its closest line
	// with the line index in line.end.line_i.
	e.point_hit_lines = function(target_p, max_sd, f) {
		let min_sd = 1/0
		let line = line3()
		let int_line = line3()
		int_line.start.copy(target_p)
		let min_int_line
		for (let i = 0, len = e.lines_len(); i < len; i++) {
			e.get_line(i, line)
			line.closestPointToPoint(target_p, true, int_line.end)
			let sd = target_p.distanceToSquared(int_line.end)
			if (sd <= max_sd) {
				int_line.end.line_i = i
				let line_sd = line.distanceSq()
				let cut_sd = line.start.distanceToSquared(int_line.end)
				if (abs(line_sd / 4 - cut_sd) <= MAXSD) { // snap to midpoint
					int_line.end.copy(line.at(.5))
				}
				if (f)
					f(int_line, line)
				if (sd < min_sd) {
					min_sd = sd
					min_int_line = min_int_line || line3()
					min_int_line.copy(int_line)
					min_int_line.end.line_i = i
				}
			}
		}
		return min_int_line
	}

	// return the line from target line to its closest line
	// with the line index in line.end.line_i.
	e.line_hit_lines = function(target_line, max_sd, f) {
		let min_sd = 1/0
		let line = line3()
		let int_line = line3()
		let min_int_line
		for (let i = 0, len = e.lines_len(); i < len; i++) {
			e.get_line(i, line)
			let p1i = line.start.i
			let p2i = line.end.i
			let tp1i = target_line.start.i
			let tp2i = target_line.end.i
			let touch1 = p1i == tp1i || p1i == tp2i
			let touch2 = p2i == tp1i || p2i == tp2i
			if (touch1 != touch2) {
				// skip lines with a single endpoint common with the target line.
			} else if (touch1 && touch2) {
				//
			} else {
				if (line_to_line_intersection(target_line, line, true, int_line)) {
					let sd = int_line.start.distanceToSquared(int_line.end)
					if (sd <= max_sd) {
						int_line.end.line_i = i
						if (f)
							f(int_line, line, sd)
						if (sd < min_sd) {
							min_sd = sd
							min_int_line = min_int_line || line3()
							min_int_line.copy(int_line)
							min_int_line.end.line_i = i
							min_int_line.parallel = int_line.parallel
						}
					}
				}
			}
		}
		return min_int_line
	}

	// line drawing in 3 stages: start, snap, add.

	e.snap_line_start = function(p) {

		let p1 = e.point_hit_points(p, MAXSD / e.camera.zoom)
		if (p1)
			return p1

		let int_line = e.point_hit_lines(p, MAXSD / e.camera.zoom)
		if (int_line)
			return int_line.end

	}

	e.snap_line_end = function(line, ref_p) {

		line.end.i = null
		line.end.line_i = null

		// snap line end to existing points.
		let int_p = e.point_hit_points(line.end, MAXSD / e.camera.zoom)
		if (int_p) {
			line.end = int_p
			return line.end
		}

		// snap line end to existing lines.
		let int_line = e.point_hit_lines(line.end, MAXSD / e.camera.zoom)
		if (int_line) {
			line.end = int_line.end
			return line.end
		}

		// snap line to existing points preserving length.
		int_line = e.line_hit_points(line)
		if (int_line) {
			let d = line.distance()
			let d1 = line.start.distanceTo(int_line.end)
			line.end = int_line.end
			line.end = line.at(d / d1)
			return line.end
		}

		if (ref_p) {
			// TODO: snap to axes and to ref point.
		}

		// snap line to axes preserving length.
		// TODO:

	}

	e.add_line = function(line) {

		let p1 = line.start
		let p2 = line.end

		// check for min. line length for lines with new endpoints.
		if (p1.i == null || p2.i == null)
			if (p1.distanceToSquared(p2) <= MAXISD)
				return

		let line_ps = [p1, p2] // line's points as an open polygon.

		// cut the line into segments at intersections with existing points.
		line = line3(p1, p2)
		e.line_hit_points(line, MAXISD, function(int_line) {
			let p = int_line.start
			let i = p.i
			if (i !== p1.i && i !== p2.i) { // exclude end points.
				p = p.clone()
				p.i = i
				line_ps.push(p)
			}
		})

		// sort intersection points by their distance relative to p1
		// so that adjacent points form line segments.
		function sort_line_ps() {
			if (line_ps.length)
				line_ps.sort(function(sp1, sp2) {
					let sd1 = p1.distanceToSquared(sp1)
					let sd2 = p1.distanceToSquared(sp2)
					return sd1 < sd2
				})
		}

		sort_line_ps()

		// check if any of the line segments intersect any existing lines.
		// the ones that do must be broken down further, and so must the
		// existing lines that are cut by them.
		let seg = line3()
		let line_ps_len = line_ps.length
		for (let i = 0; i < line_ps_len-1; i++) {
			seg.start = line_ps[i]
			seg.end   = line_ps[i+1]
			e.line_hit_lines(seg, MAXISD, function(int_line, line, sd) {
				let p = int_line.end
				let line_i = p.line_i
				p = p.clone()
				p.line_i = line_i
				line_ps.push(p)
			})
		}

		// sort the points again if new points were added.
		if (line_ps.length > line_ps_len)
			sort_line_ps()

		// create missing points.
		for (let p of line_ps)
			if (p.i == null) {
				e.point_coords.push(p.x, p.y, p.z)
				p.i = e.points_len() - 1
				print('point', p.i)
			}

		// create line segments.
		for (let i = 0, len = line_ps.length; i < len-1; i++) {
			let p1i = line_ps[i  ].i
			let p2i = line_ps[i+1].i
			e.line_pis.push(p1i, p2i)
			print('line', p1i, p2i)
		}

		// cut intersecting lines in two.
		for (let p of line_ps) {
			if (p.line_i != null) {
				let p1i = e.line_pis[2*p.line_i  ]
				let p2i = e.line_pis[2*p.line_i+1]
				let pmi = p.i
				e.line_pis[2*p.line_i  ] = p1i
				e.line_pis[2*p.line_i+1] = pmi
				e.line_pis.push(pmi, p2i)
			}
		}

		invalidate()
	}

	e.remove_line = function(line_i) {
		//
		invalidate()
	}

	e.move_line = function(line_i, rel_p) {
		//
		invalidate()
	}

	e.move_point = function(p_i, rel_p) {
		//
		invalidate()
	}

	e.remove_poly = function(poly) {
		if (e.polys.remove_value(poly))
			invalidate()
	}

	// rendering

	e.group = new THREE.Group()
	e.group.poly_mesh = e
	e.group.name = e.name

	function invalidate() {

		e.group.clear()

		let points = new THREE.BufferAttribute(new Float32Array(e.point_coords), 3)

		{
			let geo = new THREE.BufferGeometry()
			geo.setAttribute('position', points)
			geo.setIndex(e.line_pis)
			mat = new THREE.LineBasicMaterial({color: 0x000000, polygonOffset: true})
			let lines = new THREE.LineSegments(geo, mat)
			e.group.add(lines)
		}

		for (let poly of e.polys) {
			triangulate_poly(poly)
			let geo = new THREE.BufferGeometry()
			geo.setAttribute('position', points)
			let mat = new THREE.MeshPhongMaterial(0xffffff)
			let mesh = new THREE.Mesh(geo, mat)
			e.group.add(mesh)
		}

		for (let i = 0, len = e.points_len(), p = v3(); i < len; i++) {
			e.get_point(i, p)
			e.group.add(dot3d(p))
		}

		if (e.line)
			e.group.add(e.line)

		if (e.point)
			e.group.add(e.point)

	}

	return e
}

// graphics elements ---------------------------------------------------------

function axis(name, x, y, z, color, dashed) {
	let material = dashed
		? new THREE.LineDashedMaterial({color: color, scale: 100, dashSize: 1, gapSize: 1})
		: new THREE.LineBasicMaterial({color: color})
	let geometry = new THREE.BufferGeometry().setFromPoints([
		v3(  0,  0,  0),
		v3(  x,  y,  z),
	])
	let line = new THREE.Line(geometry, material)
	line.computeLineDistances()
	line.name = name
	return line
}

function axes() {
	let M = MAXD
	return [
		axis('+z_axis',  0,  0, -M, 0x00ff00),
		axis('+x_axis',  M,  0,  0, 0xff0000),
		axis('+y_axis',  0,  M,  0, 0x0000ff),
		axis('-z_axis',  0,  0,  M, 0x00ff00, true),
		axis('-x_axis', -M,  0,  0, 0xff0000, true),
		axis('-y_axis',  0, -M,  0, 0x0000ff, true),
	]
}

function skydome() {

	let vshader = `
		varying vec3 vWorldPosition;
		void main() {
			vec4 worldPosition = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPosition.xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}

	`

	let fshader = `
		uniform vec3 topColor;
		uniform vec3 bottomColor;
		uniform float offset;
		uniform float exponent;
		varying vec3 vWorldPosition;
		void main() {
			float h = normalize(vWorldPosition + offset).y;
			gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
		}
	`

	let uniforms = {
		topColor     : {value: color(0x9999cc)},
		bottomColor  : {value: color(0xffffff)},
		offset       : {value: 33},
		exponent     : {value: .6},
	}

	let geo = new THREE.BoxBufferGeometry(2*MAXD, 2*MAXD, 2*MAXD)
	let mat = new THREE.ShaderMaterial({
		uniforms       : uniforms,
		vertexShader   : vshader,
		fragmentShader : fshader,
		side: THREE.BackSide,
	})
	let e = new THREE.Mesh(geo, mat)
	e.name = 'skydome'
	return e
}

function ground() {
	let geo = new THREE.PlaneBufferGeometry(2*MAXD, 2*MAXD)
	let mat = new THREE.MeshLambertMaterial({color: 0xffffff, depthTest: false})
	mat.color.setHSL(0.09, .6, 0.75)
	let e = new THREE.Mesh(geo, mat)
	e.rotation.x = -PI / 2
	e.receiveShadow = true
	e.name = 'ground'
	return e
}

function hemlight() {
	let e = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6)
	e.color.setHSL(0.6, 1, 0.6)
	e.groundColor.setHSL(0.095, 1, 0.75)
	e.position.set(0, 50, 0)
	return e
}

function dirlight() {
	let e = new THREE.DirectionalLight(0xffffff, 1)
	e.color.setHSL(0.1, 1, 0.95)
	e.position.set( -1, 1.75, 1)
	e.position.multiplyScalar(30)
	/*
	e.castShadow = true
	e.shadow.mapSize.width = 2048
	e.shadow.mapSize.height = 2048
	let d = 50
	e.shadow.camera.left = - d
	e.shadow.camera.right = d
	e.shadow.camera.top = d
	e.shadow.camera.bottom = - d
	e.shadow.camera.far = 3500;
	e.shadow.bias = - 0.0001;
	*/
	return e
}

function line3d(line, color) {
	let p1 = line.start
	let p2 = line.end
	let geo = new THREE.BufferGeometry().setFromPoints([p1, p2])
	let mat = new THREE.LineBasicMaterial({color: color, polygonOffset: true})
	let e = new THREE.Line(geo, mat)
	e.line = line
	e.update = function() {
		let p1 = line.start
		let p2 = line.end
		let pb = geo.attributes.position
		pb.setXYZ(0, p1.x, p1.y, p1.z)
		pb.setXYZ(1, p2.x, p2.y, p2.z)
		pb.needsUpdate = true
	}
	property(e, 'color', {
		get: () => mat.color.getHex(),
		set: c => mat.color.setHex(c),
	})
	return e
}

{
	let loader = new THREE.TextureLoader()
	let disc_texture = loader.load('disc.png')
	let mat = new THREE.PointsMaterial({
		color: 0xff00ff,
		size: 10,
		sizeAttenuation: false,
		map: disc_texture,
		alphaTest: 0.5,
	})
	let points = new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)
	function dot3d(p) {
		let geo = new THREE.BufferGeometry()
		geo.setAttribute('position', points)
		let e = new THREE.Points(geo, mat)
		e.position.copy(p)
		return e
	}
}


// editor --------------------------------------------------------------------

component('x-modeleditor', function(e) {

	// camera, scene, renderer, ground, axes, cursor, model

	e.camera = new THREE.PerspectiveCamera(70, 1, MIND / 100, MAXD * 100)
	e.camera.position.x =  .2
	e.camera.position.y =  .5
	e.camera.position.z =  1.5
	e.camera.rotation.x = -rad(10)
	e.camera.rotation.y = -rad(30)

	e.scene = new THREE.Scene()
	e.scene.name = 'scene'
	e.scene.add(skydome())
	e.ground = ground()
	e.scene.add(e.ground)
	e.scene.add(...axes())
	e.scene.add(hemlight())
	e.scene.add(dirlight())

	e.renderer = new THREE.WebGLRenderer({antialias: true})
	e.renderer.setPixelRatio(window.devicePixelRatio)
	e.renderer.outputEncoding = THREE.sRGBEncoding
	e.renderer.shadowMap.enabled = true

	e.renderer.setAnimationLoop(function() {
		e.renderer.render(e.scene, e.camera)
	})

	e.canvas = e.renderer.domElement
	e.canvas.attr('tabindex', -1)
	e.canvas.attr('style', 'position: absolute')
	e.add(e.canvas)

	focusable_widget(e, e.canvas)

	e.detect_resize()
	function resized(r) {
		e.camera.aspect = r.w / r.h
		e.camera.updateProjectionMatrix()
		e.renderer.setSize(r.w, r.h)
	}
	e.on('resize', resized)

	e.on('bind', function(on) {
		//if (on) resized(e.rect())
	})

	let cursor_x = {line:  0}
	let cursor_y = {line: 27}
	let cursor
	e.property('cursor', () => cursor, function(name) {
		cursor = name
		let x = cursor_x[name] || 0
		let y = cursor_y[name] || 0
		e.canvas.style.cursor = 'url(cursor_'+name+'.png) '+x+' '+y+', auto'
	})

	// model ------------------------------------------------------------------

	e.components = {} // {name->group}
	e.model = new THREE.Group()
	e.model.name = 'model'
	e.scene.add(e.model)
	e.instance = poly_mesh({camera: e.camera})
	e.model.add(e.instance.group)

	print(e.scene)

	// tools ---------------------------------------------------------------------

	let tools = {}

	tools.select = {}


	tools.orbit = {}

	tools.orbit.bind = function(e, on) {
		if (on && !e.controls) {
			e.controls = new THREE.OrbitControls(e.camera, e.canvas)
			e.controls.minDistance = MIND * 10
			e.controls.maxDistance = MAXD / 100
		}
		e.controls.enabled = on
	}

	tools.orbit.pointermove = function(e) {
		e.controls.update()
	}

	tools.line = {}

	tools.line.bind = function(e, on) {
		if (!on) {
			if (e.instance.line) {
				e.instance.group.remove(e.instance.line)
				e.instance.line = null
			}
			if (e.instance.point) {
				e.instance.group.remove(e.point)
				e.instance.point = null
			}
		}
	}

	tools.line.pointermove = function(e, ev, ht) {
		let h = ht[0]
		let p
		if (e.instance.line) {
			e.instance.line.line.end.copy(h.point)
			p = e.instance.snap_line_end(e.instance.line.line)
			e.instance.line.update()
		} else {
			p = e.instance.snap_line_start(h.point)
		}
		if (!e.instance.point && p) {
			e.instance.point = dot3d(p)
			e.instance.group.add(e.instance.point)
		} else if (p) {
			e.instance.point.position.copy(p)
			e.instance.point.visible = true
		} else if (e.instance.point) {
			e.instance.point.visible = false
		}
	}

	tools.line.pointerdown = function(e, ev, ht) {
		let h = ht[0]
		if (e.instance.line) {
			e.instance.add_line(e.instance.line.line)
			e.instance.line = null
		}
		if (h && h.object == e.ground) {
			let p = e.instance.snap_line_start(h.point) || h.point
			e.instance.line = line3d(line3(p, p.clone()), 0x000000)
			e.instance.group.add(e.instance.line)
		}
		return e.capture_pointer_raycast(ev, function(e, ev, ht) {
			//
		})
	}

	tools.line.keydown = function(e, key) {
		if (key == 'Escape') {
			tools.line.bind(e, false)
			return false
		}
	}

	tools.pull = {}

	tools.pull.pointerdown = function(ev, ht) {
		//
	}

	tools.move = {}

	let toolkeys = {
		l: 'line',
		p: 'pull',
		o: 'orbit',
		m: 'move',
	}

	// current tool -----------------------------------------------------------

	let tool, toolname
	e.property('tool', () => toolname, function(name) {
		if (tool && tool.bind)
			tool.bind(e, false)
		tool = assert(tools[name])
		toolname = name
		if (tool.bind)
			tool.bind(e, true)
		e.cursor = tool.cursor || name
	})

	e.tool = 'orbit'

	// mouse handling ---------------------------------------------------------

	let raycaster = new THREE.Raycaster()
	let mouse = v2()

	function hittest(mx, my) {
		// calculate mouse position in normalized device coordinates
		// (-1 to +1) for both components
		let r = e.rect()
		let x =  (mx / r.w) * 2 - 1
		let y = -(my / r.h) * 2 + 1
		mouse.x = x
		mouse.y = y
		raycaster.setFromCamera(mouse, e.camera)
		let ht = raycaster.intersectObjects(e.model.children)
		if (!ht.length)
			ht = raycaster.intersectObject(e.ground)
		return ht
	}

	e.on('pointermove', function(ev, mx, my) {
		if (tool.pointermove)
			tool.pointermove(e, ev, hittest(mx, my))
	})

	e.on('pointerdown', function(ev, mx, my) {
		if (tool.pointerdown)
			tool.pointerdown(e, ev, hittest(mx, my))
	})

	e.capture_pointer_raycast = function(ev, move, up) {
		let movewrap = move && function(ev, mx, my) {
			return move(e, ev, hittest(mx, my))
		}
		let upwrap = up && function(ev, mx, my) {
			return up(e, ev, hittest(mx, my))
		}
		return e.capture_pointer(ev, movewrap, upwrap)
	}

	// key handling -----------------------------------------------------------

	e.on('keydown', function(key) {
		if (tool.keydown)
			if (tool.keydown(e, key) === false)
				return false
		let toolname = toolkeys[key.toLowerCase()]
		if (toolname) {
			e.tool = toolname
			return false
		} else if (key == ' ') {
			e.tool = e.tool == 'select' ? 'orbit' : 'select'
			return false
		}
	})

})

})()
