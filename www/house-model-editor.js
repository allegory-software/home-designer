(function () {
"use strict"
const G = window

function house_model_editor(e) {

	e = model3_editor(e)

	let project_wall_to_roof_face
	{

	let edge = line3()
	function wall_edge(wp) {
		let [x, y] = wp
		edge[0].set(x, 0, y)
		edge[1].set(x, 1, y)
		return edge
	}

	let cl = line3() // wall cut line i.e. wall base line projected on the roof face plane
	let cl_on_wall = line2() // cut line in wall plane as 2D vector
	let cl_on_roof = line2() // cut line in roof plane as 2D vector
	let sl = line2() // resulting seg line

	project_wall_to_roof_face = function(wall, wp1, wp2, roof_face) {

		roof_face.plane().intersect_line(wall_edge(wp1), cl[0])
		roof_face.plane().intersect_line(wall_edge(wp2), cl[1])

		cl.transform(wall.plane, cl_on_wall)
		cl.transform(roof_face.plane(), cl_on_roof)

		let ts = cl_on_roof.split_by_poly(roof_face, 'inside', [])

		for (let i = 0, n = ts.length; i < n; i += 2) {
			let t1 = ts[i+0]
			let t2 = ts[i+1]
			cl_on_wall.at(t1, sl[0])
			cl_on_wall.at(t2, sl[1])
			let sp1 = wall.add_point(sl[0][0], sl[0][1])
			let sp2 = wall.add_point(sl[1][0], sl[1][1])
			wall.add_seg(sp1, sp2)
			if (t1 == 0) wall.sp1 = sp1
			if (t2 == 1) wall.sp2 = sp2
		}
	}
	}

	function create_plan() {

		// TODO:
		// let c = e.create_component({name: 'test'})
		// e.root.comp.add_child(c, mat4())
		// let p = plane().set_from_coplanar_points(v3(0, 0, 0), v3(1, 1, 0), v3(1, 1, 1))
		// let [x, y] = p.transform_xyz_xy(0, 1, 1)

		/*
		let p = plane_graph()
		let p1 = p.add_point(-14, 0)
		let p2 = p.add_point(200, 0)
		p.add_seg(p1, p2)
		let p3 = p.add_point(-14, 214)
		let p4 = p.add_point(200, 214)
		p.add_seg(p3, p4)
		p.add_seg(p1, p3)
		p.add_seg(p2, p4)
		p.fix()
		pr(p)
		*/

		let house = assert(e.house)

		for (let floor of house.floors) {

			push_log('creating floor', floor.id)

			push_log('creating floor plan')

			let c = e.create_component({name: 'floor_'+floor.i})
			e.root.comp.add_child(c, mat4())

			for (let fcomp of floor.comps) {
				let face_pis = []
				let face_holes = []
				for (let cycle of fcomp.cycles) {
					let pi0
					for (let ep of cycle.edges) {
						let pi = c.add_point_xyz(ep[0], 0, ep[1])
						face_pis.push(pi)
						pi0 = pi0 ?? pi
					}
					if (!cycle.outer)
						face_holes.push(pi0)
				}
				c.add_face(face_pis, null, null, face_holes)
			}

			pop_log()

			for (let roof of floor.roofs ?? empty_array) {

				let roof_name = 'roof_'+floor.i

				push_log('creating roof', roof_name)

				let c = e.create_component({name: roof_name})
				e.root.comp.add_child(c, mat4())

				roof.comp = c

				if (roof.type == 'gable') {

					// calculate the ridge end-point coords om the xz-plane
					let pitch = roof.pitch
					let h = assert(roof.h)
					let eaves = roof.eaves ?? 0
					let axis = roof.axis ?? 'v'
					let [bx1, bz1, bx2, bz2] = roof.box
					let rx1, rz1, rx2, rz2, y1, y2
					if (axis == 'v') {
						rz1 = bz1
						rz2 = bz2
						rx1 = (bx2 + bx1) / 2
						rx2 = rx1
					} else {
						rx1 = bx1
						rx2 = bx2
						rz1 = (bz2 + bz1) / 2
						rz2 = rz1
					}

					// generate the 2 sides, 2 faces each, of the gable roof
					for (let j = 0; j <= 1; j++) { // bottom then top face

						let ry = h + j * 20

						// generate the ridge end-points for this face
						c.add_point_xyz(rx1, ry, rz1)
						c.add_point_xyz(rx2, ry, rz2)

						for (let i = 0; i <= 1; i++) { // left then right side
							let pis = []
							let x1, z1, x2, z2
							if (axis == 'v') {
								z1 = rz1
								z2 = rz2
								x1 = i ? bx2 : bx1
								x2 = x1
							} else {
								x1 = rx1
								x2 = rx2
								z1 = i ? bz2 : bz1
								z2 = z1
							}
							let y = ry - 100
							if (!i) {
								c.add_point_xyz(x2, y, z2)
								c.add_point_xyz(x1, y, z1)
								if (!j)
									pis.push(3, 2, 1, 0)
								else
									pis.push(6, 7, 8, 9)
							} else {
								c.add_point_xyz(x1, y, z1)
								c.add_point_xyz(x2, y, z2)
								if (!j)
									pis.push(5, 4, 0, 1)
								else
									pis.push(7, 6, 10, 11)
							}
							let face = c.add_face(pis)
							face.bottom = !j
						}

					}

					// create fascias
					c.add_face([1, 2, 8, 7, 11, 5])
					c.add_face([0, 4, 10, 6, 9, 3])
					c.add_face([3, 9, 8, 2])
					c.add_face([4, 5, 11, 10])

				}

				pop_log()

			} // for roof

			if (floor.roofs) {

				push_log('raising walls')
				let A = v3()
				let B = v3()
				let C = v3()
				for (let fcomp of floor.comps) {
					for (let cycle of fcomp.cycles) {
						let a = cycle.edges
						let n = a.length
						let p2 = a[n-1]
						for (let i = 0; i < n; i++) {
							let p1 = a[i]

							// raise a wall from this edge up to the roofs.
							let wall_id = gen_id('wall')
							// let c = e.create_component({name: wall_id})
							// e.root.comp.add_child(c, mat4())

							let wall = plane_graph()
							wall.id = wall_id
							push_log_if(true, 'raising wall', wall.id, 'between', p1.p.id, p2.p.id)

							// create wall's vertical plane.
							// The order of p1,p2 is important in order to orient the
							// faces of the edges of the outer cycle outwards,
							// and the faces of the edges of the inner cycles inwards.
							let [x1, y1] = p1
							let [x2, y2] = p2
							A.set(x1, 0, y1)
							B.set(x2, 0, y2)
							C.set(x1, 1, y1)
							wall.plane = plane().set_from_coplanar_points(A, B, C)

							// add wall base line
							let [ax, ay] = wall.plane.transform_xyz_xy(A[0], A[1], A[2])
							let [bx, by] = wall.plane.transform_xyz_xy(B[0], B[1], B[2])
							// A.transform(wall.plane)
							// B.transform(wall.plane)
							let wall_p1 = wall.add_point(ax, ay)
							let wall_p2 = wall.add_point(bx, by)
							wall.add_seg(wall_p1, wall_p2)

							// project wall base line on each roof face plane
							// and intersect it with the roof face poly, keeping
							// only the parts that are inside the poly.
							for (let roof of floor.roofs)
								for (let face of roof.comp.faces)
									if (face.bottom)
										project_wall_to_roof_face(wall, p1, p2, face)

							// add wall's vertical edges
							if (wall.sp1) wall.add_seg(wall_p1, wall.sp1)
							if (wall.sp2) wall.add_seg(wall_p2, wall.sp2)

							wall.fix()
							pop_log()

							c.add(wall)

							p2 = p1
						}
					}
				}

				pop_log()

			} // if roofs: raise walls

			pop_log()

		} // for floor

	}

	create_plan()
	e.update_all()

	e.free = do_after(e.free, function() {
		e.house.free()
	})

	return e
}


let MODEL_EDITOR_ID         = ui.S-1
let MODEL_EDITOR_DRAW_STATE = ui.S+0

function free_house_model_editor(st) {
	let me = st.get('editor')
	me.free()
}

ui.box_widget('house_model_editor', {

	create: function(cmd, id, house, fr, align, valign, min_w, min_h) {

		let st = ui.state(id)
		let me = st.get('editor')
		me ??= house_model_editor({id: id, house: house})
		st.set('editor', me)
		ui.on_free(id, free_house_model_editor)

		let [dstate, dx, dy] = ui.drag(id)

		if (dstate == 'drag') {
			ui.focus(id)
			me.pointerdown()
		} else if (dstate == 'dragging') {
			me.pointermove()
		} else if (dstate == 'drop') {
			me.pointerup()
		} else if (dstate == 'hover') {
			me.pointermove()
		}
		if (ui.dblclick)
			me.click(2)
		else if (ui.click)
			me.click(1)

		if (ui.focused(id))
			for (let [ev, key] of ui.key_events)
				if (ev == 'down')
					me.keydown(key)
				else if (ev == 'up')
					me.keyup(key)

		if (dstate && me.cursor_url) {
			ui.set_cursor(me.cursor_url)
		}

		if (dstate && ui.wheel_dy)
			me.wheel(ui.wheel_dy)

		return ui.cmd_box(cmd, fr, align, valign, min_w, min_h,
				id, me.draw_state,
			)

	},

	after_position: function(a, i, axis)	{
		let w  = a[i+2]
		let h  = a[i+3]
		let id = a[i+MODEL_EDITOR_ID]
		//
	},

	after_translate: function(a, i) {
		let x = a[i+0]
		let y = a[i+1]
		let w = a[i+2]
		let h = a[i+3]
		let id = a[i+MODEL_EDITOR_ID]
		let me = ui.state(id).get('editor')
		me.position(x, y, w, h)
	},

	draw: function(a, i) {

		let x  = a[i+0]
		let y  = a[i+1]
		let w  = a[i+2]
		let h  = a[i+3]
		let id = a[i+MODEL_EDITOR_ID]
		let ds = a[i+MODEL_EDITOR_DRAW_STATE]

		let hs = ui.hit(id)

		let cx = ui.cx

		cx.save()
		cx.translate(x, y)
		cx.beginPath()
		cx.rect(0, 0, w, h)
		cx.clip()
		ds.draw()
		cx.restore()

	},

	hit: function(a, i) {

		let x  = a[i+0]
		let y  = a[i+1]
		let w  = a[i+2]
		let h  = a[i+3]
		let id = a[i+MODEL_EDITOR_ID]

		if (ui.hit_box(a, i))
			ui.hover(id)

	},

})

}()) // module function
