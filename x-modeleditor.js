/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

// precision settings --------------------------------------------------------

let MIND   = 0.001        // min line distance
let MAXD   = 1e4          // max model total distance
let MAXSD  = 0.001 ** 2   // max distance^2 for snapping
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

/*
function closestPointsDet( ) { // mp and mq  non-collinear

	// using determinant

 	var qp = new THREE.Vector3( ).subVectors( p, q );

	var qpDotmp = qp.dot( mp );
	var qpDotmq = qp.dot( mq );
	var mpDotmp = mp.dot( mp );
	var mqDotmq = mq.dot( mq );
	var mpDotmq = mp.dot( mq );

	var detp = qpDotmp * mqDotmq - qpDotmq * mpDotmq;
	var detq = qpDotmp * mpDotmq - qpDotmq * mpDotmp;

	var detm = mpDotmq * mpDotmq - mqDotmq * mpDotmp;

	pnDet = p.clone( ).add( mp.clone( ).multiplyScalar( detp / detm ) );
	qnDet = q.clone( ).add( mq.clone( ).multiplyScalar( detq / detm ) );

	dpnqnDet = pnDet.clone( ).sub( qnDet ).length( );

}

function closestPointsCross( ) { // mp and mq  non-collinear

	// using cross vectors

	var qp = new THREE.Vector3( ).subVectors( p, q );
	var pq = qp.clone( ).multiplyScalar( -1 );

	var npq = new THREE.Vector3( ).crossVectors( mp, mq ).normalize( );
	var nqp = new THREE.Vector3( ).crossVectors( mq, mp ).normalize( );

	var n1 = new THREE.Vector3( ).crossVectors( mp, nqp ).normalize( );
	var n2 = new THREE.Vector3( ).crossVectors( mq, npq ).normalize( );

	var qpDotn1 = qp.dot( n1 );
	var pqDotn2 = pq.dot( n2 );

	var mpDotn2 = mp.dot( n2 );
	var mqDotn1 = mq.dot( n1 );

	pnCr = p.clone( ).add( mp.clone( ).multiplyScalar( pqDotn2 / mpDotn2 ) );
	qnCr = q.clone( ).add( mq.clone( ).multiplyScalar( qpDotn1 / mqDotn1 ) );

	dpnqnCr = pnCr.clone( ).sub( qnCr ).length( );

}
*/

// returns the
// returns null if lines are parallel.
THREE.Line3.closestLine = function(line, clamp, out_line) {


}

// dynamic point clouds ------------------------------------------------------

function point_cloud(size) {

	let e = {}
	let a

	function setsize(size1) {
		size1 = nextpow2(size1)
		let a1 = new Float32Array(size1 * 3)
		if (a)
			a1.set(a)
		a = a1
		size = size1
		e.buffer_attribute = new THREE.BufferAttribute(a, 3)
	}

	let len = 0
	function setlen(len1) {
		assert(len1 >= 0)
		if (size < len1)
			setsize(len1)
		len = len1
	}

	setsize(or(size, 8))

	property(e, 'length', {get: () => len, set: setlen})

	e.get = function(i, out) {
		assert(i >= 0 && i < len)
		if (out) {
			out.x = a[i*3]
			out.y = a[i*3+1]
			out.z = a[i*3+2]
		} else {
			out = v3(a[i*3], a[i*3+1], a[i*3+2])
		}
		out.i = i
		return out
	}

	e.set = function(i, p) {
		assert(i >= 0)
		setlen(max(i+1, len))
		a[i*3  ] = p.x
		a[i*3+1] = p.y
		a[i*3+2] = p.z
		e.buffer_attribute.needsUpdate = true
	}

	e.add = function(p) {
		e.set(len, p)
		return len-1
	}

	e.insert = function(i, p) {
		assert(false) // TODO
	}

	e.remove = function(i) {
		assert(i >= 0 && i < len)
		if (i+1 < len) {
			assert(false) // TODO
		}
		len--
	}

	e.find = function(p) {
		for (let i = 0; i < len; i++)
		if (a[i*3] == p.x && a[i*3+1] == p.y && a[i*3+2] == p.z)
			return i
	}

	// hit-testing

	// return the closest point to target point with the point index in p.i.
	e.point_hit = function(target_p, max_sd, f) {
		max_sd = max_sd || MAXSD
		let min_sd = 1/0
		let min_p
		let p = v3()
		for (let i = 0; i < len; i++) {
			let sd = e.get(i, p).distanceToSquared(target_p)
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

	// return the line from closest point to target line
	// with the point index in line.start.i.
	e.line_hit = function(target_line, max_sd, f) {
		max_sd = max_sd || MAXSD
		let min_sd = 1/0
		let int_line = line3()
		let min_int_line
		let p1 = int_line.start
		let p2 = int_line.end
		for (let i = 0; i < len; i++) {
			e.get(i, p1)
			target_line.closestPointToPoint(p1, true, p2)
			let sd = p1.distanceToSquared(p2)
			if (sd <= max_sd) {
				//let t = target_line.closestPointToPointParameter(p1, true)
				//int_line.end = t
				if (f)
					f(int_line, sd)
				if (sd < min_sd) {
					min_sd = sd
					min_int_line = min_int_line || line3()
					min_int_line.start.copy(p1)
					min_int_line.end.copy(p2)
					min_int_line.start.i = i
					//min_int_line.end.t = t
				}
			}
		}
		return min_int_line
	}

	return e
}

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

	e.points = point_cloud()
	e.line_pis = [] // [l1p1i, l1p2i, l2p1i, l2p2i, ...]
	e.polys = [] // [[material_id: mi, mesh: m, p1i, p2i, ...], ...]

	e.group = new THREE.Group()

	function poly_plane_normal(poly) {
		if (!poly.plane_normal) {
			assert(poly.length >= 3)
			let p1 = v3()
			let p2 = v3()
			let p3 = v3()
			for (let i = 2; i < poly.length; i++) {
				e.points.get(poly[0], p1)
				e.points.get(poly[1], p2)
				e.points.get(poly[i], p3)
				poly.plane_normal = triangle_plane_normal(p1, p2, p3)
				if (poly.plane_normal)
					break
			}
		}
		return poly.plane_normal
	}

	let p = v3()
	function get_x(poly, i) { return e.points.get(poly[i], p).projectOnPlane(poly.plane_normal).x }
	function get_y(poly, i) { return e.points.get(poly[i], p).projectOnPlane(poly.plane_normal).y }

	// length of output index array: 3 * (poly.length - 2)
	function poly_triangulate(poly) {
		if (!poly.triangle_pis) {
			let plane_normal = poly_plane_normal()
			let pis = EarcutIndices.triangulate(get_x, get_y, poly, null, 2)
			for (let i = 0; i < pis.length; i++)
				pis[i] = e.points[pis[i]]
			poly.triangle_pis	= pis
			poly.geometry.setIndex(poly.triangle_pis)
		}
	}

	e.add_poly = function(poly) {
		poly.material = new new THREE.MeshPhongMaterial(0xffffff)
		poly.geometry = new THREE.BufferGeometry()
		poly.geometry.setAttribute('position', e.points.buffer_attribute)
		poly_triangulate()
		poly.mesh = new THREE.Mesh(poly.geometry, poly.material)
		e.polys.add(poly)
		e.group.add(poly.mesh)
	}

	e.remove_poly = function(poly) {
		e.group.remove(poly.mesh)
		e.polys.remove_value(poly)
	}

	e.lines_geometry = new THREE.BufferGeometry()
	e.lines_geometry.setAttribute('position', e.points.buffer_attribute)
	e.lines_geometry.setIndex(e.line_pis)
	e.lines_material = new THREE.LineBasicMaterial({color: 0xff00ff, polygonOffset: true})
	e.lines = new THREE.LineSegments(e.lines_geometry, e.lines_material)

	e.group.add(e.lines)

	e.get_line = function(i, out) {
		let p1i = e.line_pis[i]
		let p2i = e.line_pis[i+1]
		out = out || line3()
		e.points.get(p1i, out.start)
		e.points.get(p2i, out.end)
		return out
	}

	// hit-testing

	e.point_hit_points = function(target_p, max_d, f) {
		return e.points.point_hit(target_p, max_d, f)
	}

	e.line_hit_points = function(target_line, max_d, f) {
		return e.points.line_hit(target_line, max_d, f)
	}

	// return the line from closest line to target point
	// with the line index in line.end.line_i.
	e.point_hit_lines = function(target_p, max_sd, f) {
		max_sd = max_sd || MAXSD
		let min_sd = 1/0
		let line = line3()
		let int_line = line3()
		int_line.start.copy(target_p)
		let min_int_line
		for (let i = 0; i < e.line_pis.length-1; i += 2) {
			line.start = e.points.get(e.line_pis[i])
			line.end   = e.points.get(e.line_pis[i+1])
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

	// return the line from closest line to target line
	// with the line index in line.end.line_i.
	e.line_hit_lines = function(target_line, max_sd, f) {
		max_sd = max_sd || MAXSD
		let min_sd = 1/0
		let line = line3()
		let int_line = line3()
		let min_int_line
		for (let i = 0; i < e.line_pis.length-1; i += 2) {
			let p1i = e.line_pis[i]
			let p2i = e.line_pis[i+1]
			line.start = e.points.get(p1i)
			line.end   = e.points.get(p2i)
			let tp1i = target_line.start.i
			let tp2i = target_line.end.i
			let touch1 = p1i == tp1i || p1i == tp2i
			let touch2 = p2i == tp1i || p2i == tp2i
			if (touch1 != touch2) {
				// skip lines with a single endpoint common with the target line.
			} else if (touch1 && touch2) {
				//
			} else {
				let parallel = target_line.closestLine(line, true, int_line)
				let sd = int_line.start.distanceToSquared(int_line.end)
				if (sd <= max_sd) {
					int_line.parallel = parallel
					int_line.end.line_i = i
					if (f)
						f(int_line, line)
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
		return min_int_line
	}

	// line drawing in 3 stages: start, snap, add.

	e.start_line = function(p) {

		let p1 = e.point_hit_points(p)
		if (p1)
			return p1

		let int_line = e.point_hit_lines(p)
		if (int_line)
			return int_line.end

		return line3(p, p)
	}

	e.snap_line_end = function(line, ref_p) {
		line.end.i = null
		line.end.line_i = null

		// snap line end to existing points.
		let int_p = e.point_hit_points(line.end)
		if (int_p) {
			line.end = int_p
			return
		}

		// snap line end to existing lines.
		let int_line = e.point_hit_lines(line.end)
		if (int_line) {
			line.end = int_line.end
			return
		}

		// snap line to existing points preserving length.
		int_line = e.line_hit_points(line)
		if (int_line) {
			let d = line.distance()
			let d1 = line.start.distanceTo(int_line.start)
			line.end = int_line.start
			line.end = line.at(d / d1)
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

		let line_ps = [p1, p2] // line segments' points.

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
		for (let i = 0; i < line_ps_len-1; i += 2) {
			seg.start = line_ps[i]
			seg.end   = line_ps[i+1]
			e.line_hit_lines(seg, MAXISD, function(int_line, line) {
				let p = int_line.end
				//if (p.i != null) {
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
			if (p.i == null)
				p.i = e.points.add(p)

		// create line segments.
		for (let i = 0; i < line_ps.length-1; i += 2) {
			let p1i = line_ps[i  ].i
			let p2i = line_ps[i+1].i
			e.line_pis.push(p1i, p2i)
		}

		// cut intersecting lines in two.
		for (let p of line_ps) {
			if (p.line_i != null) {
				let p1i = e.line_pis[p.line_i  ]
				let p2i = e.line_pis[p.line_i+1]
				let pmi = p.i
				e.line_pis[p.line_i  ] = p1i
				e.line_pis[p.line_i+1] = pmi
				e.line_pis.push(pmi, p2i)
			}
		}

		e.lines_geometry.setIndex(e.line_pis)

	}

	e.remove_line = function(line_i) {
		//
	}

	e.move_line = function(line_i, rel_p) {
		//
	}

	e.move_point = function(p_i, rel_p) {
		//
	}

	return e
}

(function() {

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

	let cursor
	e.property('cursor', () => cursor, function(name) {
		cursor = name
		e.canvas.style.cursor = 'url(cursor_'+name+'.png), auto'
	})

	// model ------------------------------------------------------------------

	e.components = {} // {name->group}
	e.model = new THREE.Group()
	e.model.name = 'model'
	e.scene.add(e.model)
	e.group = e.model // currently editable group within the model

	let helpers = new THREE.Group() // helper geometry for editor state

	let o = poly_mesh()
	e.group.add(o.group)

	let line = o.start_line(v3(0, 0, 0))
	line.end = v3(1, 1, -1)
	//o.snap_line_end(line)
	o.add_line(line)

	print(e.scene)

	// tools ---------------------------------------------------------------------

	let tools = {}

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

	tools.line.pointermove = function(e, ev, ht) {
		//
	}

	{
		let loader = new THREE.TextureLoader()
		let disc_texture = loader.load('disc.png')

		function dot(p) {
			let geo = new THREE.Geometry()
			geo.vertices.push(p)
			var mat = new THREE.PointsMaterial({
				color: 0xff00ff,
				size: 10,
				sizeAttenuation: false,
				map: disc_texture,
				alphaTest: 0.5,
			})
			return new THREE.Points(geo, mat)
		}
	}

	tools.line.pointerdown = function(e, ev, ht) {
		let h = ht[0]
		if (h && h.object == e.ground) {

			e.scene.add(dot(h.point))
		}
		return e.capture_pointer_raycast(ev, function(e, ev, ht) {
			print(ht.length)
		})
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

	let tool
	e.property('tool', () => tool, function(name) {
		if (tool && tool.bind)
			tool.bind(e, false)
		tool = assert(tools[name])
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
		let tool = toolkeys[key]
		if (tool)
			e.tool = tool
	})

})

})()
