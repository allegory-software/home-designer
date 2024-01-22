// line-line-intersection ----------------------------------------------------

// pr(line_line_intersection(line3(v3(0, 0, 0), v3(1, 0, 0)), line3(v3(0, 1, 0), v3(1, 1, 0))))

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



	// hit-testing

	// return the closest point to target point with the point index in p.i.
	e.point_hit_points = function(target_p, max_ds, f) {
		let min_ds = 1/0
		let min_p
		let p = v3()
		for (let i = 0, len = e.points_len(); i < len; i++) {
			let ds = e.get_point(i, p).distanceToSquared(target_p)
			if (ds <= max_ds) {
				if (f)
					f(p, ds)
				if (ds < min_ds) {
					min_ds = ds
					min_p = min_p || v3()
					min_p.copy(p)
					min_p.i = i
				}
			}
		}
		return min_p
	}


	// line drawing in 3 stages: snap_start, snap_end, add.

	e.snap_line_start = function(line, snap_ds) {

		line.start.i = null
		line.start.line_i = null
		line.start.snap = false

		let int_p = e.point_hit_points(line.start, snap_ds)
		if (int_p) {
			line.start.copy(int_p)
			line.start.i = int_p.i
			line.start.snap = 'point'
			return
		}

		let int_line = e.point_hit_lines(line.start, snap_ds)
		if (int_line) {
			line.start.copy(int_line.end)
			line.start.line_i = int_line.end.line_i
			line.start.snap = int_line.end.midpoint ? 'line_middle' : 'line'
			return
		}

	}

	e.snap_line_end = function(line, ref_p, snap_ds, initial_snap) {

		line.end.i = null
		line.end.line_i = null
		line.end.snap = false
		line.snap = initial_snap

		// snap line end to existing points.
		let int_p = e.point_hit_points(line.end, snap_ds)
		if (int_p) {
			line.end.copy(int_p)
			line.end.i = int_p.i
			line.end.snap = 'point'
			return
		}

		// snap line end to existing lines.
		let int_line = e.point_hit_lines(line.end, snap_ds)
		if (int_line) {
			line.end.copy(int_line.end)
			line.end.line_i = int_line.end.line_i
			line.end.snap = int_line.end.midpoint ? 'line_middle' : 'line'
			return
		}

		// snap line to existing points preserving length.
		int_line = e.line_hit_points(line, snap_ds)
		if (int_line) {
			let d = line.distance()
			let d1 = line.start.distanceTo(int_line.end)
			line.end.copy(int_line.end)
			line.end.copy(line.at(d / d1, v3()))
			line.point_i = int_line.end.i
			line.snap = 'point_line'
			return
		}

	}


// "2D cross-product" aka "perp dot product" (dot-perp):
// it's the length of the cross-product vector where a, b are points on the 3D xy plane with z=0.
// it's also the dot-product of the _|_ of a (rotated ccw 90deg) and b.
// it's also the area of the parallelogram between a, b (and it's signed).
// its sign tells if rotating from a to b is clockwise (+ is cw, - is ccw).
// its sign also tells, if you place b on top of a, if you have to turn right (-)
// or left (+) to get from a to b, or if a and b are collinear (0).
// A polygon is convex if all perp_dots are (+) or (-).
// See: http://www.sunshine2k.de/articles/Notes_PerpDotProduct_R2.pdf
function dot_perp(a, b) {
	return a[0] * b[1] - a[1] * b[0]
}

