/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

(function() {

// precision settings --------------------------------------------------------

let MIND    = 0.001         // min line distance
let MAXD    = 1e4           // max model total distance
let SNAPD   = 0.03          // max distance for snapping
let TOUCHD  = 0.01          // max distance for selecting
let MAXID   = 0.00001       // max distance for intersections

// primitive construction ----------------------------------------------------

function v2(x, y)      { return new THREE.Vector2(x, y) }
function v3(x, y, z)   { return new THREE.Vector3(x, y, z) }
function line3(p1, p2) { return new THREE.Line3(p1, p2) }
function color(c)      { return new THREE.Color(c) }

function out_v3(p, out_p) { return out_p ? out_p.copy(p) : p.clone() }
function out_line3(line, out_line) { return out_line ? out_line.copy(line) : line.clone() }

// line-line intersection ----------------------------------------------------

{
	let mp = v3()
	let mq = v3()
	let qp = v3()
	let rp = v3()
	let rq = v3()
	let p1 = v3()
	let p2 = v3()
	let line = line3(rp, rq)

	// returns the smallest line that connects two (coplanar or skewed) lines.
	// returns null for parallel lines.
	function line_line_intersection(lp, lq, clamp, out_line) {

		let p = lp.start
		let q = lq.start
		lp.delta(mp)
		lq.delta(mq)
		qp.copy(p).sub(q)

		let qp_mp = qp.dot(mp)
		let qp_mq = qp.dot(mq)
		let mp_mp = mp.dot(mp)
		let mq_mq = mq.dot(mq)
		let mp_mq = mp.dot(mq)

		let detp = qp_mp * mq_mq - qp_mq * mp_mq
		let detq = qp_mp * mp_mq - qp_mq * mp_mp
		let detm = mp_mq * mp_mq - mq_mq * mp_mp

		if (detm == 0) // lines are parallel
			return

		rp.copy(p).add(mp.multiplyScalar(detp / detm))
		rq.copy(q).add(mq.multiplyScalar(detq / detm))

		if (clamp) {
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

		return out_line3(line, out_line)
	}
}

// find plane normal from 3 points -------------------------------------------

{
	let p = v3()
	let q = v3()
	function triangle_plane_normal(p1, p2, p3, out_p) {
		p.subVectors(p2, p1)
		q.subVectors(p3, p1)
		p.cross(q).normalize()
		return p.length() > .5 ? out_v3(p, out_p) : null
	}
}

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
// test_plane_regions()

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

	// return the line from target line to its closest point
	// with the point index in line.end.i.
	e.line_hit_points = function(target_line, max_ds, f) {
		let min_ds = 1/0
		let int_line = line3()
		let min_int_line
		let p1 = int_line.start
		let p2 = int_line.end
		let i1 = target_line.start.i
		let i2 = target_line.end.i
		for (let i = 0, len = e.points_len(); i < len; i++) {
			if (i == i1 || i == i2) // don't hit target line's endpoints
				continue
			e.get_point(i, p2)
			target_line.closestPointToPoint(p2, true, p1)
			let ds = p1.distanceToSquared(p2)
			if (ds <= max_ds) {
				if (f)
					f(int_line, ds)
				if (ds < min_ds) {
					min_ds = ds
					min_int_line = min_int_line || line3()
					min_int_line.start.copy(p1)
					min_int_line.end.copy(p2)
					min_int_line.end.i = i
				}
			}
		}
		return min_int_line
	}

	// return the line from target point to its closest line
	// with the line index in line.end.line_i and midpoint flag in line.end.midpoint.
	e.point_hit_lines = function(target_p, max_ds, f) {
		let min_ds = 1/0
		let line = line3()
		let int_line = line3()
		int_line.start.copy(target_p)
		let min_int_line
		let p = v3()
		let max_d = sqrt(max_ds)
		for (let i = 0, len = e.lines_len(); i < len; i++) {
			e.get_line(i, line)
			line.closestPointToPoint(target_p, true, int_line.end)
			let ds = target_p.distanceToSquared(int_line.end)
			if (ds <= max_ds) {
				int_line.end.line_i = i
				let line_d = line.distance()
				let cut_d = line.start.distanceTo(int_line.end)
				let midpoint = abs(line_d / 2 - cut_d) <= max_d
				if (midpoint) // snap to midpoint
					int_line.end.copy(line.at(.5, p))
				int_line.end.midpoint = midpoint
				if (f)
					f(int_line, line)
				if (ds < min_ds) {
					min_ds = ds
					min_int_line = min_int_line || line3()
					min_int_line.copy(int_line)
					min_int_line.end.line_i = i
					min_int_line.end.midpoint = int_line.end.midpoint
				}
			}
		}
		return min_int_line
	}

	// return the line from target line to its closest line
	// with the line index in line.end.line_i.
	e.line_hit_lines = function(target_line, max_ds, clamp, f) {
		let min_ds = 1/0
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
				if (line_line_intersection(target_line, line, clamp, int_line)) {
					let ds = int_line.start.distanceToSquared(int_line.end)
					if (ds <= max_ds) {
						int_line.end.line_i = i
						if (f)
							f(int_line, line, ds)
						if (ds < min_ds) {
							min_ds = ds
							min_int_line = min_int_line || line3()
							min_int_line.copy(int_line)
							min_int_line.end.line_i = i
						}
					}
				}
			}
		}
		return min_int_line
	}

	e.add_line = function(line) {

		let MAXIDS = MAXID ** 2

		let p1 = line.start
		let p2 = line.end

		// check for min. line length for lines with new endpoints.
		if (p1.i == null || p2.i == null) {
			if (p1.distanceToSquared(p2) <= MAXIDS)
				return
		} else if (p1.i == p2.i) {
			// check if end point was snapped to start end point.
			return
		}

		let line_ps = [p1, p2] // line's points as an open polygon.

		// cut the line into segments at intersections with existing points.
		line = line3(p1, p2)
		e.line_hit_points(line, MAXIDS, function(int_line) {
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
					let ds1 = p1.distanceToSquared(sp1)
					let ds2 = p1.distanceToSquared(sp2)
					return ds1 < ds2
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
			e.line_hit_lines(seg, MAXIDS, true, function(int_line, line) {
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
			lines.poly_mesh = e
			e.group.add(lines)
		}

		for (let poly of e.polys) {
			triangulate_poly(poly)
			let geo = new THREE.BufferGeometry()
			geo.setAttribute('position', points)
			let mat = new THREE.MeshPhongMaterial(0xffffff)
			let mesh = new THREE.Mesh(geo, mat)
			mesh.poly_mesh = e
			e.group.add(mesh)
		}

		/*
		for (let i = 0, len = e.points_len(), p = v3(); i < len; i++) {
			e.get_point(i, p)
			e.group.add(dot3d(p))
		}
		*/

		if (e.line)
			e.group.add(e.line)

		if (e.point)
			e.group.add(e.point)

	}

	return e
}

// graphics elements ---------------------------------------------------------

function axis(name, x, y, z, color, dashed) {
	let mat = dashed
		? new THREE.LineDashedMaterial({color: color, scale: 100, dashSize: 1, gapSize: 1})
		: new THREE.LineBasicMaterial({color: color})
	let geo = new THREE.BufferGeometry().setFromPoints([
		v3(  0,  0,  0),
		v3(  x,  y,  z),
	])
	let line = new THREE.Line(geo, mat)
	line.computeLineDistances()
	line.name = name
	return line
}

function axes() {
	let M = MAXD
	let e = new THREE.Group()
	e.add(
		axis('+z_axis',  0,  0, -M, 0x00ff00),
		axis('+x_axis',  M,  0,  0, 0xff0000),
		axis('+y_axis',  0,  M,  0, 0x0000ff),
		axis('-z_axis',  0,  0,  M, 0x00ff00, true),
		axis('-x_axis', -M,  0,  0, 0xff0000, true),
		axis('-y_axis',  0, -M,  0, 0x0000ff, true),
	)
	return e
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

function line3d(line, color, dashed) {
	line = line || line3()
	color = color || 0
	let geo = new THREE.BufferGeometry().setFromPoints([line.start, line.end])
	let mat = dashed
		? new THREE.LineDashedMaterial({color: color, scale: 100, dashSize: 1, gapSize: 1, polygonOffset: true})
		: new THREE.LineBasicMaterial({color: color, polygonOffset: true})
	let e = new THREE.Line(geo, mat)
	e.computeLineDistances()
	e.line = line
	e.update = function() {
		let pb = geo.attributes.position
		let p1 = e.line.start
		let p2 = e.line.end
		pb.setXYZ(0, p1.x, p1.y, p1.z)
		pb.setXYZ(1, p2.x, p2.y, p2.z)
		pb.needsUpdate = true
		e.computeLineDistances()
	}
	property(e, 'color', () => color, function(color1) {
		color = color1
		mat.color.setHex(color)
	})
	return e
}

function vector3d() {
	let e = new THREE.Group()
	e.line = line3d(line3())
	let geo = new THREE.ConeGeometry(.01, .04)
	geo.translate(0, -.04 / 2, 0)
	geo.rotateX(PI / 2)
	let mat = new THREE.MeshPhongMaterial({color: 0x333333})
	e.cone = new THREE.Mesh(geo, mat)
	e.add(e.line)
	e.add(e.cone)
	e.origin = v3()
	e.vector = v3()
	e.update = function() {
		let len = e.vector.length()
		e.line.line.end.z = len
		e.cone.position.z = len
		e.line.update()
		let p = e.position.clone()
		e.position.copy(v3())
		e.lookAt(e.vector)
		e.position.copy(p)
	}
	return e
}

// editor --------------------------------------------------------------------

component('x-modeleditor', function(e) {

	let pe = e

	// camera, scene, renderer, ground, axes

	e.camera = new THREE.PerspectiveCamera(60, 1, MIND / 100, MAXD * 100)
	e.camera.position.x =  .2
	e.camera.position.y =  .5
	e.camera.position.z =  1.5
	e.camera.rotation.x = -rad(10)
	e.camera.rotation.y = -rad(30)

	let snap_d = SNAPD

	e.scene = new THREE.Scene()
	e.scene.add(skydome())
	e.ground = ground(); e.scene.add(e.ground)
	e.xyplane = xyplane(); e.scene.add(e.xyplane)
	e.zyplane = zyplane(); e.scene.add(e.zyplane)
	e.xzplane = xzplane(); e.scene.add(e.xzplane)
	e.ref_planes = [e.xyplane, e.zyplane, e.xzplane]
	e.axes = axes()
	e.scene.add(e.axes)
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

	/*
	e.overlay = tag('canvas', {
		style: `
			position: absolute;
			left: 0; top: 0; right: 0; bottom: 0;
			pointer-events: none;
		`})
	e.add(e.overlay)
	e.cx = e.overlay.getContext('2d')
	*/

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

	// cursor -----------------------------------------------------------------

	{
		let cursor_x = {line:  0}
		let cursor_y = {line: 25}
		let cursor
		e.property('cursor', () => cursor, function(name) {
			cursor = name
			let x = cursor_x[name] || 0
			let y = cursor_y[name] || 0
			e.canvas.style.cursor = 'url(cursor_'+name+'.png) '+x+' '+y+', auto'
		})
	}

	// cursor tooltip ---------------------------------------------------------

	{
		let timer
		let tooltip_text = ''
		let tooltip = div({style: `
			position: absolute;
			white-space: nowrap;
			user-select: none;
			margin-left: .5em;
			margin-top : .5em;
			padding: .25em .5em;
			border: 1px solid #aaaa99;
			color: #333;
			background-color: #ffffcc;
			font-family: sans-serif;
			font-size: 12px;
		`}, tooltip_text)

		tooltip.hide()
		e.add(tooltip)

		function show_tooltip() {
			tooltip.show()
			timer = null
		}

		e.property('tooltip', () => tooltip_text, function(s) {
			if (timer) {
				clearInterval(timer)
				timer = null
			}
			tooltip.hide()
			if (s) {
				tooltip.set(s)
				tooltip.x = e.mouse.x
				tooltip.y = e.mouse.y
				timer = setTimeout(show_tooltip, 200)
			}
		})
	}

	// helper dots ------------------------------------------------------------

	{
		let dot2d_styles = {
			default: `
				position: absolute;
				pointer-events: none;
				margin-left: -4px;
				margin-top : -4px;
				width : 8px;
				height: 8px;
				border-radius: 100%;
				border: 1px solid black;
			`
		}

		e.dot = function(point) {
			let e = div()
			e.point = point || v3()

			let type
			property(e, 'type', () => type, function(type1) {
				if (type1 == type) return
				type = type1
				e.style = dot2d_styles[type || 'default']
			})

			let color
			property(e, 'color', () => color, function(color1) {
				if (color1 == color) return
				color = color1
				e.style['background-color'] = color
			})

			let p = v3()
			e.update = function() {
				p.copy(e.point).project(pe.camera)
				let x = round(( p.x + 1) * pe.canvas.width  / 2)
				let y = round((-p.y + 1) * pe.canvas.height / 2)
				e.x = x
				e.y = y
			}

			property(e, 'visible',
				function()  { return !e.hasattr('hidden') },
				function(v) { e.show(!!v) }
			)

			e.free = function() {
				e.remove()
			}

			e.type = 'default'

			pe.add(e)

			return e
		}
	}

	// helper lines -----------------------------------------------------------

	e.line = function(...args) {
		let e = line3d(...args)
		e.free = function() {
			pe.scene.remove(e)
		}
		pe.scene.add(e)
		return e
	}

	// helper vectors ---------------------------------------------------------

	let helpers = {}
	function v3d(id, vector, origin) {
		let ve = helpers[id]
		if (!ve) {
			ve = vector3d()
			helpers[id] = ve
			e.scene.add(ve)
		}
		if (vector)
			ve.vector.copy(vector)
		if (origin)
			ve.position.copy(origin)
		ve.update()
	}

	// reference planes -------------------------------------------------------

	function ref_plane(
			name, normal, plane_hit_tooltip,
			main_axis_snap, main_axis, main_axis_snap_tooltip
	) {
		let geo = new THREE.PlaneBufferGeometry(2*MAXD, 2*MAXD)
		let mat = new THREE.MeshLambertMaterial({depthTest: false, visible: false, side: THREE.DoubleSide})
		let e = new THREE.Mesh(geo, mat)
		e.name = name
		e.main_axis_snap = main_axis_snap

		e.hit_face = function() {
			e.position.setScalar(0)
			let h = pe.raycaster.intersectObject(e)[0]
			if (!h)
				return
			let plane_dir = pe.raycaster.ray.origin.clone().projectOnPlane(v3(0, 1, 0))
			h.angle = plane_dir.angleTo(normal)
			if (h.angle > PI / 2)
				h.angle = abs(h.angle - PI)
			h.plane = e
			h.tooltip = plane_hit_tooltip
			return h
		}

		e.free_line_end_snap_to_main_axis = function(line_start) {
			// move ref plane at line start point so we can raycast to it.
			e.position.copy(line_start)
			let h = pe.raycaster.intersectObject(e)[0]
			if (!h)
				return
			let p1 = h.point.clone().sub(line_start)
			let p21 = main_axis.clone().setLength(p1.length())
			let p22 = p21.clone().negate()
			let ds1 = p1.distanceToSquared(p21)
			let ds2 = p1.distanceToSquared(p22)
			let p2 = ds1 < ds2 ? p21 : p22
			h.ds = min(ds1, ds2)
			if (h.ds > snap_d ** 2)
				return
			h.point = p2.add(line_start)
			h.snap = main_axis_snap
			h.tooltip = main_axis_snap_tooltip
			return h
		}

		// intersect the plane's main axis from an origin with a line
		// and return the projected point on the line.
		let int_line = line3()
		let main_axis_line = line3()
		e.main_axis_hit_line = function(line, axis_origin, out_p) {
			main_axis_line.start.copy(axis_origin)
			main_axis_line.end.addVectors(axis_origin, main_axis)
			if (!line_line_intersection(main_axis_line, line, false, int_line))
				return
			let ds = int_line.start.distanceToSquared(int_line.end)
			if (ds > MAXID ** 2)
				return
			return out_v3(int_line.end, out_p)
		}

		return e
	}

	function xyplane() {
		return ref_plane(
			'xyplane', v3(0, 0, 1), 'on the blue-red vertical plane',
			'blue_axis', v3(0, 1, 0), 'on blue axis')
	}

	function zyplane() {
		let e = ref_plane(
			'zyplane', v3(1, 0, 0), 'on the blue-green vertical plane',
			'green_axis', v3(0, 0, 1), 'on green axis')
		e.rotation.y = -PI / 2
		return e
	}

	function xzplane() {
		let e = ref_plane(
			'xzplane', v3(0, 1, 0), 'on the horizontal plane',
			'red_axis', v3(1, 0, 0), 'on red axis')
		e.rotation.x = -PI / 2
		return e
	}

	{
		let hits = []
		let cmp_hits = function(h1, h2) {
			let ds1 = h1 ? h1.ds : 1/0
			let ds2 = h2 ? h2.ds : 1/0
			return ds1 == ds2 ? 0 : (ds1 < ds2 ? -1 : 1)
		}
		function free_line_end_snap_to_axes(line_start) {
			let i = 0
			for (let plane of e.ref_planes)
				hits[i++] = plane.free_line_end_snap_to_main_axis(line_start)
			hits.sort(cmp_hits)
			return hits[0]
		}

	}

	{
		let int_p = v3()
		let ret = {point: v3()}
		function point_on_line_snap_to_axes(line, p, line_start) {
			ret.distance = 1/0
			ret.plane = null
			for (let plane of e.ref_planes) {
				if (plane.main_axis_hit_line(line, line_start, int_p)) {
					let d = p.distanceTo(int_p)
					if (d <= snap_d && d <= ret.distance) {
						ret.distance = d
						ret.point.copy(int_p)
						ret.plane = plane
					}
				}
			}
			return ret.plane ? ret : null
		}
	}

	// model ------------------------------------------------------------------

	e.components = {} // {name->group}
	e.model = new THREE.Group()
	e.model.name = 'model'
	e.scene.add(e.model)
	e.instance = poly_mesh()
	e.model.add(e.instance.group)

	print(e.scene)

	// direct-manipulation tools ==============================================

	let tools = {}

	// select tool ------------------------------------------------------------

	tools.select = {}

	tools.select.pointerdown = function(e) {

		let h = e.raycaster.intersectObject(e.model, true)[0]
		if (!h)
			return

		//if (h.object.type == 'LineSegments')



		/*
		let touch_ds = TOUCHD ** 2

		let ray = line3(
			e.raycaster.ray.origin,
			e.raycaster.ray.direction)

		let int_line = e.line_hit_lines(ray, touch_ds, false)
		if (int_line) {

			= int_line.end.line_i

			e.selected_line =

		}
		*/

	}

	// orbit tool -------------------------------------------------------------

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

	// current point hit-testing and snapping ---------------------------------

	function cpoint_hit_test_and_snap() {

		// hit model
		let hit = e.raycaster.intersectObject(e.model, true)[0]
		if (!hit)
			return

		if (hit.object.type == 'LineSegments') {

			let p = hit.point
			p.line_i = hit.index / 2
			p.snap = 'line'

			let indices = hit.object.geometry.index.array
			let i1 = indices[hit.index+0]
			let i2 = indices[hit.index+1]
			let pos = hit.object.geometry.attributes.position.array
			let p1x = pos[i1*3+0]
			let p1y = pos[i1*3+1]
			let p1z = pos[i1*3+2]
			let p2x = pos[i2*3+0]
			let p2y = pos[i2*3+1]
			let p2z = pos[i2*3+2]
			let p1 = v3(p1x, p1y, p1z)
			let p2 = v3(p2x, p2y, p2z)
			let line = line3(p1, p2)

			let line_d = line.distance()
			let cut1_d = p1.distanceTo(p)

			if (abs(cut1_d) <= snap_d) {
				p.copy(p1)
				p.i = i1
				p.snap = 'point'
			} else if (abs(line_d - cut1_d) <= snap_d) {
				p.copy(p2)
				p.i = i2
				p.snap = 'point'
			} else if (abs(line_d / 2 - cut1_d) <= snap_d) {
				line.at(.5, p)
				p.snap = 'line_middle'
			} else {
				let hit = point_on_line_snap_to_axes(line, p, e.cline.line.start)
				if (hit) {
					p.copy(hit.point)
					e.cline.line.snap = hit.plane.main_axis_snap
				}
			}

			return hit
		}

	}

	// line tool --------------------------------------------------------------

	tools.line = {}

	tools.line.bind = function(e, on) {
		if (on) {
			let endp = v3()
			e.cpoint = e.dot(endp)
			e.cline = e.line(line3(v3(), endp))
			e.cline.color = 0x000000
			e.cpoint.visible = false
			e.cline.visible = false
			e.ref_point = e.dot()
			e.ref_point.visible = false
		} else {
			tools.line.cancel()
			e.cpoint = e.cpoint.free()
			e.cline  = e.cline.free()
			e.ref_point = e.ref_point.free()
		}
	}

	tools.line.cancel = function() {
		e.tooltip = ''
		e.cline.visible = false
		e.ref_point.visible = false
	}

	let snap_tooltips = {
		point: 'on point',
		line: 'on line',
		point_line: 'touching point',
		line_middle: 'on line middle',
	}

	let point_snap_colors = {
		point: '#000000',
		line: '#ff00ff',
		line_middle: '#ffff00',
	}

	let line_snap_colors = {
		point_line : 0xff00ff,
		blue_axis  : 0x0000ff,
		red_axis   : 0xff0000,
		green_axis : 0x00ff00,
	}

	tools.line.pointermove = function(e) {

		let cline = e.cline.line
		let p1 = cline.start
		let p2 = cline.end
		p2.i = null
		p2.line_i = null
		p2.snap = false
		cline.snap = null

		let hit = cpoint_hit_test_and_snap()

		if (!e.cline.visible) {

			// hit ground
			if (!hit)
				hit = e.xzplane.hit_face()

			// hit vertical ref planes
			if (!hit)  {
				let h1 = e.xyplane.hit_face()
				let h2 = e.zyplane.hit_face()
				// pick whichever plane is facing the camera more straightly.
				hit = (h1 ? h1.angle : 1/0) < (h2 ? h2.angle : 1/0) ? h1 : h2
			}

			if (hit) {
				let sp = hit.point
				update(p1, sp)
				update(p2, sp)
			}

			e.start_plane = hit && hit.plane

		} else {

			if (hit && hit.point.i != null && hit.point.i != cline.start.i) {
				e.ref_point.point.copy(hit.point)
				e.ref_point.update()
				e.ref_point.visible = true
			}

			if (!hit) {
				hit = free_line_end_snap_to_axes(p1)
				if (hit)
					cline.snap = hit.snap
			}

			if (!hit && e.start_plane)
				hit = e.start_plane.hit_face()

			if (e.ref_point && hit) {
				update(p2, hit.point)
				let hit1 = point_on_line_snap_to_axes(cline, hit.point, e.ref_point.point)
				if (hit1) {
					e.ref_line = e.ref_line || e.line(null, null, true)
					e.ref_line.line.start.copy(e.ref_point.point)
					e.ref_line.line.end.copy(hit1.point)
					e.ref_line.update()
					e.ref_line.visible = true
					hit = hit1
				} else if (e.ref_line)
					e.ref_line.visible = false
			}

			if (hit) {
				let sp = hit.point
				update(p2, sp)
			}

		}

		e.cpoint.visible = !!e.cpoint.point.snap

		e.tooltip =
			snap_tooltips[e.cpoint.point.snap
			|| e.cline.line.snap]
			|| (hit && hit.tooltip)

		e.cpoint.color = point_snap_colors[e.cpoint.point.snap] || ''
		e.cline.color = line_snap_colors[e.cline.line.snap] || 0x000000

		e.cpoint.update()
		e.cline.update()
	}

	tools.line.pointerdown = function(e) {
		e.tooltip = ''
		if (e.cline.visible) {
			let cline = e.cline.line
			let closing = cline.end.i != null || cline.end.line_i != null
			e.instance.add_line(cline)
			if (closing) {
				tools.line.cancel()
			} else {
				cline.start.copy(cline.end)
				cline.start.i = cline.end.i
			}
		} else {
			e.cline.visible = true
		}
	}

	tools.line.keydown = function(e, key) {
		if (key == 'Escape') {
			tools.line.cancel()
			return false
		}
	}

	// rectangle tool ---------------------------------------------------------

	tools.rect = {}

	tools.rect.pointerdown = function(e) {

	}

	// push/pull tool ---------------------------------------------------------

	tools.pull = {}

	tools.pull.pointerdown = function(e) {
		//
	}

	// move tool --------------------------------------------------------------

	tools.move = {}

	// current tool -----------------------------------------------------------

	let tool
	{
		let toolname
		e.property('tool', () => toolname, function(name) {
			e.tooltip = ''
			if (tool && tool.bind)
				tool.bind(e, false)
			tool = assert(tools[name])
			toolname = name
			if (tool.bind)
				tool.bind(e, true)
			if (tool.pointermove)
				tool.pointermove(e, ev)
			e.cursor = tool.cursor || name
		})
	}

	e.tool = 'orbit'

	// mouse handling ---------------------------------------------------------

	e.mouse = v2()
	e.raycaster = new THREE.Raycaster()
	e.raycaster.params.Line.threshold = TOUCHD

	{
		let pm = v2()
		function update_mouse(mx, my) {
			e.mouse.x = mx
			e.mouse.y = my
			// calculate mouse position in normalized device coordinates.
			pm.x =  (mx / e.canvas.width ) * 2 - 1
			pm.y = -(my / e.canvas.height) * 2 + 1
			e.raycaster.setFromCamera(pm, e.camera)
		}
	}

	e.on('pointermove', function(ev, mx, my) {
		update_mouse(mx, my)
		if (tool.pointermove)
			tool.pointermove(e)
	})

	e.on('pointerdown', function(ev, mx, my) {
		update_mouse(mx, my)
		if (tool.pointerdown) {
			function capture(move, up) {
				let movewrap = move && function(ev, mx, my) {
					update_mouse(mx, my)
					return move(e, ev)
				}
				let upwrap = up && function(ev, mx, my) {
					update_mouse(mx, my)
					return up(e, ev)
				}
				return e.capture_pointer(ev, movewrap, upwrap)
			}
			tool.pointerdown(e, capture)
			if (tool.pointermove)
				tool.pointermove(e)
		}
	})

	e.on('pointerleave', function(ev) {
		e.tooltip = ''
	})

	e.canvas.on('wheel', function(ev, delta) {
		e.controls.enableZoom = false
		let factor = .1
		let mx =  (ev.clientX / e.canvas.width ) * 2 - 1
		let my = -(ev.clientY / e.canvas.height) * 2 + 1
		let v = v3(mx, my, 0.5)
		v.unproject(e.camera)
		v.sub(e.camera.position)
		v.setLength(factor)
		if (delta < 0) {
			e.camera.position.add(v)
			e.controls.target.add(v)
			e.camera.updateProjectionMatrix()
		} else {
			e.camera.position.sub(v)
			e.controls.target.sub(v)
			e.camera.updateProjectionMatrix()
		}
		return false
	})

	// key handling -----------------------------------------------------------

	let tool_keys = {
		l: 'line',
		r: 'rect',
		p: 'pull',
		o: 'orbit',
		m: 'move',
	}

	e.on('keydown', function(key, shift, ctrl) {
		if (shift || ctrl)
			return
		if (tool.keydown)
			if (tool.keydown(e, key) === false)
				return false
		let toolname = tool_keys[key.toLowerCase()]
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
