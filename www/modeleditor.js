/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

(function () {
"use strict"
const G = window

let TRACE_GL = 0 // trace gl calls

// stack with freelist.
function freelist_stack(create) {
	let e = {}
	let stack = []
	let fl = freelist(create)
	e.push = function() {
		let e = fl.alloc()
		stack.push(e)
		return e
	}
	e.pop = function() {
		let e = stack.pop()
		fl.free(e)
		return e
	}
	e.clear = function() {
		while (this.pop());
	}
	e.stack = stack
	return e
}

let glue_log = log

function modeleditor(e) {

	let house = assert(e.house)

	e.prop = function(k, t) {
		e[k] = t.default
	}

	e.draw_state = {}

	function log(...args) {
		glue_log(e.name, ...args)
	}

	// colors ------------------------------------------------------------------

	let white = 0xffffff
	let selected_color = 0x0000ff
	let ref_color = 0xff00ff
	let x_axis_color = 0x990000
	let y_axis_color = 0x000099
	let z_axis_color = 0x006600

	// canvas & webgl context -------------------------------------------------

	let canvas = document.createElement('canvas')
	canvas.classList.add('modeleditor-canvas')
	canvas.style.position = 'absolute'
	canvas.style.zIndex = -1 // put it behind the 2D canvas which serves as overlay.

	ui.screen.appendChild(canvas)
	ui.on_free(e.id, function() {
		canvas.remove()
	})

	let gl = assert(canvas.getContext('webgl2'))
	//gl.wrap_calls()

	// camera -----------------------------------------------------------------

	let camera = camera3()
	let min_distance = 0.001  // min line distance
	let max_distance = 1e4    // max model total distance

	function update_camera_proj() {
		camera.view_size.set(floor(cw), floor(ch))
		if (e.projection == 'ortho') {
			camera.ortho(-10, 10, -10, 10, -1e2, 1e2)
		} else {
			camera.fov  = e.fov
			camera.near = min_distance * 100
			camera.far  = max_distance * 100
			camera.perspective()
		}
		update_camera()
	}

	e.set_ortho = function(v) { update_camera_proj() }
	e.set_fov   = function(v) { update_camera_proj() }
	e.set_camera_pos = function(v) { camera.pos.set(v); update_camera() }
	e.set_camera_dir = function(v) { camera.dir.set(v); update_camera() }
	e.set_camera_up  = function(v) { camera .up.set(v); update_camera() }

	e.prop('projection' , {store: 'var', type: 'enum'  , enum_values: ['perspective', 'ortho'], default: 'perspective'})
	e.prop('fov'        , {store: 'var', type: 'number', default: 60})
	e.prop('camera_pos' , {store: 'var', type: 'v3', default: camera.pos})
	e.prop('camera_dir' , {store: 'var', type: 'v3', default: camera.dir})
	e.prop('camera_up'  , {store: 'var', type: 'v3', default: camera.up })

	function update_camera() {
		camera.update()

		if (skybox)
			skybox.update_view(camera.pos)

		update_sunlight_pos()
		update_renderer()

		mouse.valid = false
		fire_pointermove()
	}

	// shadows ----------------------------------------------------------------

	e.set_shadows = function(v) { renderer.enable_shadows = v; update_renderer() }

	e.prop('shadows', {store: 'var', type: 'boolean', default: false})

	// sun position -----------------------------------------------------------

	e.set_sunlight  = function(v) { update_sunlight_pos(); update_renderer() }
	e.set_time      = function(v) { update_sun_pos(); update_renderer() }
	e.set_north     = function(v) { update_sun_pos(); update_renderer() }
	e.set_latitude  = function(v) { update_sun_pos(); update_renderer() }
	e.set_longitude = function(v) { update_sun_pos(); update_renderer() }

	e.prop('sunlight'   , {store: 'var', type: 'boolean', default: false})
	e.prop('time'       , {store: 'var', type: 'datetime', default: 1596272400})
	e.prop('north'      , {store: 'var', type: 'number', default: 0})
	e.prop('latitude'   , {store: 'var', type: 'number', default: 44.42314, decimals: null})
	e.prop('longitude'  , {store: 'var', type: 'number', default: 26.35673, decimals: null})

	let sun_dir = v3()
	function update_sun_pos() {
		let {azimuth, altitude} = suncalc.sun_position(e.time, e.latitude, e.longitude)
		sun_dir.set(v3.z_axis)
			.rotate(v3.x_axis, -altitude)
			.rotate(v3.y_axis, -azimuth + rad * e.north)
		update_sunlight_pos()
	}

	function update_sunlight_pos() {
		if (e.sunlight || e.shadows) {
			renderer.sunlight_dir.set(sun_dir)
		} else {
			renderer.sunlight_dir.set(camera.dir)
		}
	}

	// rendering --------------------------------------------------------------

	e.prop('skybox', {store: 'var', type: 'bool', default: false, attr: true})
	e.prop('background_color', {store: 'var', type: 'color', default: '#ffffff00', attr: true})

	let bg_color = () => v4().from_rgba(e.background_color)

	e.set_background_color = function(v) {
		renderer.background_color = bg_color()
		ui.animate()
	}

	function draw(prog) {
		if (TRACE_GL)
			gl.start_trace()
		let t0 = time()
		if (skybox)
		 	skybox.draw(prog)
		//ground_rr.draw(prog)
		draw_model(prog)
		if (TRACE_GL)
			pr(gl.stop_trace())
		helper_lines_rr.draw(prog)
	}

	let renderer

	function init_renderer() {
		renderer = gl.scene_renderer({
			enable_shadows: e.shadows,
			camera: camera,
			background_color: bg_color(),
		})
	}

	e.draw_state.draw = function() {
		renderer.render(draw)
		draw_helper_points()
	}

	function update_renderer() {
		renderer.update()
		ui.animate()
	}

	let cx, cy, cw, ch, dpr
	e.position = function(x, y, w, h) {
		let dpr1 = devicePixelRatio
		let rescale = dpr1 != dpr
		let resize = w != cw || h != ch || rescale
		let repos = x != cx || y != cy || rescale
		dpr = dpr1
		if (repos) {
			cx = x
			cy = y
			canvas.style.left = (x / dpr) + 'px'
			canvas.style.top  = (y / dpr) + 'px'
		}
		if (resize) {
			cw = w
			ch = h
			canvas.style.width  = (w / dpr) + 'px'
			canvas.style.height = (h / dpr) + 'px'
			canvas.width  = w
			canvas.height = h
			canvas.cw = w
			canvas.ch = h
			update_camera_proj()
			ui.animate()
		}
	}

	// undo/redo stacks -------------------------------------------------------

	let undo_groups = [] // [i1, ...] indices in undo_stack where groups start
	let undo_stack  = [] // [args1...,argc1,f1, ...]
	let redo_groups = [] // same
	let redo_stack  = [] // same

	function start_undo() {
		undo_groups.push(undo_stack.length)
	}

	function push_undo(f, ...args) {
		undo_stack.push(...args, args.length, f)
	}

	function undo_from(stack, start) {
		if (start == null)
			return
		start_undo()
		while (stack.length > start) {
			let f = stack.pop()
			let argc = stack.pop()
			f(...stack.splice(-argc))
		}
	}

	function undo() {
		let stack  = undo_stack
		let groups = undo_groups
		let start  = groups.pop()
		if (start == null)
			return
		undo_groups = redo_groups
		undo_stack  = redo_stack
		undo_from(stack, start)
		undo_groups = groups
		undo_stack  = stack
	}

	function redo() {
		undo_from(redo_stack, redo_groups.pop())
	}

	// materials --------------------------------------------------------------

	let materials = [] // [{diffuse_color:, diffuse_map:, uv: , opacity: , faces: [face1,...]},...]
	let next_material_num = 0

	function add_material(opt) {
		let mat = assign({
			diffuse_color: 0xffffff,
			uv: v2(1, 1),
			opacity: 1,
		}, opt)
		mat.name = mat.name ?? 'material ' + (next_material_num++)
		mat.opacity = clamp(mat.opacity, 0, 1)
		materials.push(mat)
		return mat
	}

	let default_material = add_material({name: 'white', diffuse_color: 0xffffff})

	for (let m of [
		{name: 'black' , diffuse_color: 0},
		{name: 'red'   , diffuse_color: 0xff0000},
		{name: 'green' , diffuse_color: 0x00ff00},
		{name: 'blue'  , diffuse_color: 0x0000ff},
	])
		add_material(m)

	// layers -----------------------------------------------------------------

	let layers = []
	let default_layer

	function init_layers() {
		default_layer = add_layer({name: 'Default', can_hide: false})
	}

	function layer_changed(node, layer) {
		// TODO
	}

	function add_layer(opt, ev) {

		let layer = ev && ev.layer || assign({visible: true, can_hide: true}, opt)
		insert(layers, ev && ev.index, layer)
		instances_valid = false

		let i = (ev && ev.index) ?? layers.length - 1

		log('add_layer', opt, ev, layer, i)

		push_undo(remove_layer, layer, {index: i})

		if (layers_list && !(ev && ev.input == layers_list)) {
			layers_list.insert_row({
					name: layer.name,
					visible: layer.visible,
				}, {input: e, row_index: i, layer: layer})
		}

		return layer
	}

	function remove_layer(layer, ev) {

		// TODO: move tbis layer's instances to the default layer.

		let i = assert(layers.remove_value(layer))
		instances_valid = false

		log('remove_layer', layer, ev, i)

		assert(!ev || ev.index == null || ev.index == i)

		push_undo(add_layer, null, {layer: layer, index: i})

		if (layers_list && !(ev && ev.input == layers_list)) {
			let row = layers_list.rows[i]
			assert(row.layer == layer)
			layers_list.remove_row(row, {input: e})
		}
	}

	function move_layers(i, n, insert_i, ev) {

		log('move_layers', i, n, insert_i, ev)

		layers.move(i, n, insert_i, ev)

		push_undo(move_layers, insert_i, n, i)

		if (layers_list && !(ev && ev.input == layers_list)) {
			layers_list.move_rows(i, n, insert_i, null, {input: e})
		}
	}

	function layer_set_visibile(layer, visible) {

		log('layer_set_visibile', layer, visible)

		layer.visible = !!visible
		instances_valid = false

		push_undo(layer_set_visibile, layer, !visible)

	}

	// components -------------------------------------------------------------

	let comps = [] // [comp1,...]
	let next_comp_num = 0

	function create_component(opt) {
		opt ??= {}
		let comp = model3_component(assign(opt, {
			name             : opt.name ?? 'component '+ (next_comp_num++),
			gl               : gl,
			push_undo        : push_undo,
			default_material : default_material,
			default_layer    : default_layer,
			child_added      : child_added,
			child_removed    : child_removed,
			layer_changed    : layer_changed,
		}))

		// comp id must be dynamic because of shader-based hit-testing
		// which limits the id range to 0..32K-1.
		let id = comps.length
		comps[id] = comp
		comp.id = id

		return comp
	}

	function update_comp(comp) {
		if (
			comp.update(
				comp.davib.dabs.model.buffer,
				comp.davib.dabs.disabled.buffer)
		)
			mouse.valid = false
	}

	// component instances ----------------------------------------------------

	// NOTE: child component objects are mat4's, that's ok, don't sweat it.

	let root
	let instances_valid

	function child_added(parent_comp, node) {
		instances_valid = false
	}

	function child_removed(parent_comp, node) {
		instances_valid = false
	}

	function child_changed(node) {
		//
		instances_valid = false
	}

	function mat4_stack() {
		let e = {}

	}

	let mstack = freelist_stack(() => mat4())
	let disabled_arr = [0]
	function update_instances_for(node, parent, path_depth, on_cur_path) {

		let davib = node.comp.davib
		let i = davib.len
		davib.len = i + 1

		let parent_m = mstack.stack.last || mat4.identity
		let m = mstack.push()
		mat4.mul(parent_m, node, m)
		m.to_mat4_array(davib.dabs.model.array, i)

		disabled_arr[0] = !on_cur_path || cur_path.length-1 > path_depth
		davib.dabs.disabled.set(i, disabled_arr)

		node.parent = parent
		let children = node.comp.children
		if (children) {
			let cur_child = cur_path[path_depth + 1]
			for (let child of children)
				if (child.layer.visible) {
					update_instances_for(child, node,
						path_depth + 1,
						cur_child == null || cur_child == child
					)
				}
		}

		mstack.pop()
	}

	function update_instances() {

		if (instances_valid)
			return

		for (let comp of comps)
			if (comp.davib)
				comp.davib.len = 0
			else
				comp.davib = gl.dyn_arr_vertex_instance_buffer({model: 'mat4', disabled: 'i8'})

		update_instances_for(root, null, 0, true)

		for (let comp of comps)
			comp.davib.upload()

		mouse.valid = false

		instances_valid = true
	}

	function init_root() {
		e.root = create_component({name: '<root>'})
		root = mat4()
		root.comp = e.root
	}

	// TODO: finish this
	function gc_components() {
		for (let [comp, insts] of instances) {
			if (!insts.length) {
				if (insts.dab)
					insts.dab.free()
				instances.delete(comp)
				comp.id = null
				comp.free()
			}
		}
		remove_values(comps, comp => comp.id == null)
		let id = 0
		for (let comp of comps)
			comp.id = id++
	}

	// drawing

	function update() {
		update_instances()
		update_comp(cur_comp)
		ui.animate()
	}

	function update_all() {
		update_instances()
		for (let comp of comps)
			update_comp(comp)
	}

	function draw_model(prog) {
		for (let i = 0, n = comps[0] && comps[0].renderers.length || 0; i < n; i++)
			for (let comp of comps)
				comp.renderers[i].draw(prog)
		axes_rr.draw(prog)
	}

	function draw_model_for_hit_test(prog) {
		for (let comp of comps)
			comp.face_renderer.draw(prog)
	}


	// instance path finding for hit testing

	let instance_path; {
	let path = []
	function instance_path_for(target_comp, target_inst_id, node) {
		path.push(node)
		if (target_comp == node.comp && target_inst_id == target_comp._inst_id)
			return true
		node.comp._inst_id++
		for (let child of node.comp.children) {
			if (instance_path_for(target_comp, target_inst_id, child))
				return true
		}
		path.pop(node)
	}
	instance_path = function(comp, inst_id) {
		for (let comp of comps)
			comp._inst_id = 0
		path.length = 0
		instance_path_for(comp, inst_id, root)
		return path
	}}

	// instance-space <-> world-space transforms

	function inst_model(comp, inst_id, out) {
		out.inst_id = inst_id
		return out.from_mat4_array(comp.davib.dabs.model.array, inst_id)
	}

	function inst_inv_model(comp, inst_id, out) {
		out.inst_id = inst_id
		return inst_model(comp, inst_id, out).invert()
	}

	// model-wide instance intersection tests

	let line_hit_lines; {
	let _m0 = mat4()
	line_hit_lines = function(target_line, max_d, p2p_distance2, int_mode, is_line_valid, is_int_line_valid) {
		if (!max_d)
			return
		for (let comp of comps) {
			for (let i = 0, n = comp.davib.len; i < n; i++) {
				let model = inst_model(comp, i, _m0)
				let int_p = comp.line_hit_lines(model, target_line, max_d, p2p_distance2, int_mode, is_line_valid, is_int_line_valid)
				if (int_p) {
					int_p.model = model
					int_p.comp = comp
					int_p.path = instance_path(int_p.comp, i)
					int_p.snap = 'line'
					return int_p
				}
			}
		}
	}}

	// selection

	function select_all(sel, with_children) {
		cur_comp.select_all(sel, with_children)
	}

	// reference planes -------------------------------------------------------

	function ref_plane(
		name, normal, plane_hit_tooltip,
		main_axis_snap, main_axis, main_axis_snap_tooltip
	) {

		let e = {}
		let plane = plane3(normal)

		{
		let _l0 = line3()
		let _pl0 = plane3()
		let _p0 = v3()
		let _p1 = v3()
		e.mouse_hit_plane = function(model) {
			let p = plane.to(_pl0).transform(model).intersect_line(mouse.ray, _p0)
			if (!p || p.t < 0)
				return
			let angle = mouse.ray.delta(_p1).angle_to(normal)
			if (angle > PI / 2)
				angle = abs(angle - PI)
			p.angle = angle
			p.tooltip = plane_hit_tooltip
			return p
		}}

		{
		let _l0 = line3()
		let _l1 = line3()
		let _l2 = line3()
		let _l3 = line3()
		e.mouse_hit_main_axis = function(model, max_hit_distance, out) {

			assert(out.is_v3)

			out.ds = 1/0
			out.line_snap = null
			out.tooltip = null

			let axis = _l0.set(v3.origin, main_axis).transform(model)
			camera.world_to_screen(axis[0], _l1[0])
			camera.world_to_screen(axis[1], _l1[1])
			let int_p = _l1.project_point(mouse, false, out)
			if (!int_p)
				return

			let ds = mouse.distance2(int_p)
			if (ds > max_hit_distance ** 2)
				return

			let ray = camera.raycast(int_p.x, int_p.y, _l2)
			let int_line = ray.intersect_line(axis, _l3)
			if (!int_line)
				return

			out.set(int_line[1])
			out.ds = ds
			out.line_snap = main_axis_snap
			out.tooltip = main_axis_snap_tooltip

			return out
		}}

		{
		let _p0 = v3()
		let _p1 = v3()
		e.point_along_main_axis = function(model, p) {
			let abs_axis = main_axis.to(_p1).transform(model)
			if (v3.cross(p, abs_axis, abs_axis).len2() < NEAR ** 2) {
				p.line_snap = main_axis_snap
				return true
			}
		}}

		// intersect the plane's main axis with a line
		// and return the projected point on the line.
		{
		let int_line = line3()
		let _l1 = line3()
		e.main_axis_hit_line = function(model, line, out) {
			let axis = _l1.set(v3.origin, main_axis).transform(model)
			if (!axis.intersect_line(line, int_line))
				return
			let ds = int_line[0].distance2(int_line[1])
			if (ds > NEAR ** 2)
				return
			out.set(int_line[1])
			out.line_snap = main_axis_snap
			return out
		}}

		return e
	}

	let xyplane = ref_plane(
		'xyplane', v3(0, 0, 1), 'on the blue-red vertical plane',
		'y_axis', v3(0, 1, 0), 'on blue axis')

	let zyplane = ref_plane(
		'zyplane', v3(1, 0, 0), 'on the blue-green vertical plane',
		'z_axis', v3(0, 0, 1), 'on green axis')

	let xzplane = ref_plane(
		'xzplane', v3(0, 1, 0), 'on the horizontal plane',
		'x_axis', v3(1, 0, 0), 'on red axis')

	let ref_planes = [xyplane, zyplane, xzplane]

	function hit_ref_planes(model) {
		// hit horizontal plane first.
		let p = xzplane.mouse_hit_plane(model)
		if (p)
			return p
		// hit vertical ref planes.
		let p1 = xyplane.mouse_hit_plane(model)
		let p2 = zyplane.mouse_hit_plane(model)
		// pick whichever plane is facing the camera more straightly.
		return (p1 ? p1.angle : 1/0) < (p2 ? p2.angle : 1/0) ? p1 : p2
	}

	let mouse_hit_axes
	{
	let ps = [v3(), v3(), v3()]
	let cmp_ps = function(p1, p2) {
		return p1.ds == p2.ds ? 0 : (p1.ds < p2.ds ? -1 : 1)
	}
	mouse_hit_axes = function(model, max_hit_distance) {
		let i = 0
		for (let plane of ref_planes)
			plane.mouse_hit_main_axis(model, max_hit_distance, ps[i++])
		ps.sort(cmp_ps)
		return ps[0].line_snap ? ps[0] : null
	}}

	// given `p` on `line`, get the axis-intersects-line point that is closest to `p`.
	{
	let int_p = v3()
	let ret = v3()
	function axes_hit_line(model, p, line, max_hit_distance) {
		let min_ds = 1/0
		let min_int_p
		for (let plane of ref_planes) {
			if (plane.main_axis_hit_line(model, line, int_p)) {
				let ds = sqrt(screen_p2p_distance2(p, int_p))
				if (ds <= max_hit_distance ** 2 && ds <= min_ds) {
					min_ds = ds
					min_int_p = assign(min_int_p || v3(), int_p)
				}
			}
		}
		return min_int_p
	}}

	function check_point_on_axes(model, p) {
		for (let plane of ref_planes)
			if (plane.point_along_main_axis(model, p))
				return true
	}

	// hybrid render/analytic-based hit-testing -------------------------------

	let hit_test_rr = gl.hit_test_renderer()

	let max_hit_distances = {
		snap      : 20, // max pixel distance for snapping
		select    :  8, // max pixel distance for selecting
		drag_pull :  2, // max pixel distance before drag-pull starts
	}

	// connect rendered comp_id/face_id/inst_id back to the model.
	let mouse_hit_faces; {
	let _v0 = v3()
	let _l0 = line3()
	let _m0 = mat4()
	let _pl0 = plane()
	mouse_hit_faces = function() {

		if (!(mouse.valid || mouse.prevent_validate)) {
			hit_test_rr.render(draw_model_for_hit_test)
			mouse.valid = true
		}

		let rr_hit = hit_test_rr.hit_test(mouse.x, mouse.y)
		if (!rr_hit)
			return

		let comp_id = rr_hit.comp_id
		let face_id = rr_hit.face_id
		let inst_id = rr_hit.inst_id

		let comp = comps[comp_id]
		let face = comp.faces[face_id]

		let model = inst_model(comp, inst_id, _m0)
		let plane = face.plane().to(_pl0).transform(model)
		let int_p = plane.intersect_line(mouse.ray, _v0)
		if (!int_p)
			return

		int_p.comp = comp
		int_p.model = model
		int_p.plane = plane
		int_p.face = face
		int_p.snap = 'face'
		int_p.path = instance_path(comp, inst_id)

		return int_p

	}}

	let screen_p2p_distance2 = camera.screen_distance2

	function snap_point_on_line(p, line, max_d, p2p_distance2, plane_int_p, axes_int_p) {

		p.i = null
		p.snap = 'line'

		max_d = max_d ** 2
		let mp = line.at(.5, v3())
		let d1 = p2p_distance2(p, line[0])
		let d2 = p2p_distance2(p, line[1])
		let dm = p2p_distance2(p, mp)
		let dp = plane_int_p ? p2p_distance2(p, plane_int_p) : 1/0
		let dx = axes_int_p  ? p2p_distance2(p, axes_int_p ) : 1/0

		if (d1 <= max_d && d1 <= d2 && d1 <= dm && d1 <= dp && d1 <= dx) {
			p.assign(line[0]) // comes with its own point index.
			p.snap = 'point'
		} else if (d2 <= max_d && d2 <= d1 && d2 <= dm && d2 <= dp && d2 <= dx) {
			p.assign(line[1]) // comes with its own point index.
			p.snap = 'point'
		} else if (dp <= max_d && dp <= d1 && dp <= d2 && dp <= dm && dp <= dx) {
			p.assign(plane_int_p)
			p.snap = 'line_plane_intersection'
		} else if (dm <= max_d && dm <= d1 && dm <= d2 && dm <= dp && dm <= dx) {
			line.at(.5, p)
			p.snap = 'line_middle'
		} else if (dx <= max_d && dx <= d1 && dx <= d2 && dx <= dm && dx <= dp) {
			p.assign(axes_int_p) // comes with its own snap flags and indices.
		}

	}

	let mouse_hit_model; {
	let _v0 = v3()
	mouse_hit_model = function(opt) {

		let int_p = mouse_hit_faces()

		let hit_d = max_hit_distances[opt.distance]
		let axes_model = opt.axes_model
		let mode = opt.mode

		if (int_p) {

			// we've hit a face, but we still have to hit any lines
			// that lie in front of it, on it, or intersecting it.

			let face_plane = int_p.plane

			function is_int_line_valid(int_p) {
				let t = int_p.t
				if (t < 0 || t > 1) return // not intersecting the segment.
				return face_plane.distance_to_point(int_p) >= -NEAR // not behind the plane
			}

			let line_int_p = line_hit_lines(
				mouse.ray, hit_d, screen_p2p_distance2, 't',
				null, is_int_line_valid)

			if (line_int_p) {

				// we've hit a line. snap to it.
				let hit_line = line_int_p.line

				// check if the hit line intersects the face plane: that's a snap point.
				let plane_int_p = face_plane.intersect_line(hit_line, _v0, 'strict')

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_model && axes_hit_line(axes_model, line_int_p, hit_line, hit_d)

				// snap the hit point along the hit line along with any additional snap points.
				snap_point_on_line(line_int_p, hit_line, hit_d, screen_p2p_distance2, plane_int_p, axes_int_p)

				if (axes_model)
					check_point_on_axes(axes_model, line_int_p)

				// if the snapped point is not behind the plane, use it, otherwise forget that we even hit the line.
				if (face_plane.distance_to_point(line_int_p) >= -NEAR)
					int_p = line_int_p

			} else {

				// free moving on the face face.

			}

		} else {

			function is_int_line_valid(int_p) {
				let t = int_p.t
				if (t < 0 || t > 1) return // not intersecting the segment.
				return true
			}

			// we haven't hit a face: hit the line closest to the ray regardless of depth.
			int_p = line_hit_lines(
				mouse.ray, hit_d, screen_p2p_distance2, 't',
				null, is_int_line_valid)

			if (int_p) {

				// we've hit a line. snap to it.
				let hit_line = int_p.line

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_model && axes_hit_line(axes_model, int_p, hit_line, hit_d)

				// snap the hit point along the hit line along with any additional snap points.
				snap_point_on_line(int_p, hit_line, hit_d, screen_p2p_distance2, null, axes_int_p)

				if (axes_model)
					check_point_on_axes(axes_model, int_p)

			} else if (mode == 'camera') {

				// chose an arbitrary point at a proportional distance from the camera.
				int_p = mouse.ray.at(min(FAR / 10, camera.pos.len()), _v0)

			} else if (mode == 'draw') {

				// we've hit squat: hit the axes and the ref planes.
				int_p = axes_model && mouse_hit_axes(axes_model, hit_d)
				int_p ||= hit_ref_planes(axes_model || cur_model)

			} else if (mode == 'select') {

				// don't hit anything else so we can unselect all.

			} else {
				assert(false)
			}

		}

		return int_p

	}}

	// currently editing instance ---------------------------------------------

	let cur_path = []
	let cur_comp = root
	let cur_model = mat4()
	let cur_inv_model = mat4()

	let axes_rr = gl.axes_renderer()
	let axes = axes_rr.axes()

	function enter_edit(path) {
		if (!path.length)
			path = [root]
		if (cur_path.equals(path))
			return
		if (cur_comp) {
			select_all(false)
			update() // update cur_comp before it changes
		}
		cur_path.set(path)
		cur_model.reset()
		cur_comp = cur_path.last.comp
		for (let node of path)
			cur_model.mul(node)
		cur_inv_model.set(cur_model).invert()
		axes.model.set(cur_model)
		axes.update()
		instances_valid = false
	}

	function exit_edit() {
		enter_edit(cur_path.slice(0, -1))
	}

	function from_world(v, out) {
		return out.set(v).transform(cur_inv_model)
	}

	function to_world(v, out) {
		return out.set(v).transform(cur_model)
	}

	// skybox -----------------------------------------------------------------

	let skybox
	if (e.skybox) {
		skybox = gl.skybox({
			images: {
				posx: '../www/skybox_posx.jpg',
				negx: '../www/skybox_negx.jpg',
				posy: '../www/skybox_posy.jpg',
				negy: '../www/skybox_negy.jpg',
				posz: '../www/skybox_posz.jpg',
				negz: '../www/skybox_negz.jpg',
			},
		})
		skybox.addEventListener('load', function() {
			ui.animate()
		})
	}

	// shadow ground plane ----------------------------------------------------

	//let ground_rr = gl.ground_plane_renderer()

	// cursor -----------------------------------------------------------------

	{
	let builtin_cursors = {
		grab: true,
	}
	let offsets = {
		line          : [0, 25],
		pull          : [12, 0],
		pullno        : [12, 0],
		select        : [5, 12],
		select_add    : [5, 12],
		select_remove : [5, 12],
		select_toggle : [5, 12],
		paint         : [6, 28],
		move          : [15,17],
	}
	let cursor
	property(e, 'cursor', () => cursor, function(name) {
		if (cursor == name)
			return
		cursor = name
		let x = offsets[name] && offsets[name][0] || 0
		let y = offsets[name] && offsets[name][1] || 0
		e.cursor_url = builtin_cursors[name] ? name : 'url(../www/cursor_'+name+'.png) '+x+' '+y+', auto'
	})
	}

	// cursor tooltip ---------------------------------------------------------

	if (0) {
	let tt = tooltip({kind: 'cursor', //timeout: 'auto',
		side: 'inner-top', align: 'start',
		target: e})
	tt.hide()

	let show_after = timer(function() {
		tt.show()
	})

	property(e, 'tooltip', () => tt.text, function(s) {
		tt.hide()
		tt.text = s
		tt.px = mouse.x
		tt.py = mouse.y
		tt.update()
		show_after(s ? .2 : false)
	})
	}

	// 2D-rendered helper points ----------------------------------------------

	let helper_points = []

	function helper_point_update() {
		ui.animate()
	}

	function helper_point(p, opt) {
		p ??= v3()
		assign(p, opt)
		helper_points.push(p)
		p.update = helper_point_update
		return p
	}

	let _v0 = v2()
	function draw_helper_point(p) {
		if (p.visible === false)
			return
		let [x, y] = camera.world_to_screen(p, _v0)
		let cx = ui.cx

		let bg =
			p.type == 'point' ? 'white'   :
			p.type == 'face'  ? '#ccccff' :
			p.type == 'line'  ? '#ffffcc' :
			null

		bg ??= (
			p.snap == 'point'                   ? 'black'   :
			p.snap == 'line'                    ? '#ff00ff' :
			p.snap == 'line_middle'             ? '#ffff00' :
			p.snap == 'face'                    ? '#ff00ff' :
			p.snap == 'line_plane_intersection' ? '#00ffff' :
			p.snap == 'ref_point'               ? 'white'   :
			null
		)

		let rot = p.snap == 'face' ? 45*rad : 0

		let round = p.snap == 'point' || p.snap == 'ref_point'

		if (rot) {
			cx.translate(x, y)
			cx.rotate(rot)
			cx.translate(-x, -y)
		}

		cx.beginPath()
		if (round)
			cx.arc(x, y, 6, 0, 2*PI)
		else
			cx.rect(x-4, y-4, 8, 8)

		cx.fillStyle = bg
		cx.fill()

		cx.lineWidth = 2
		cx.strokeStyle = 'black'
		cx.stroke()

		if (p.text) {
			cx.fillStyle = ui.bg_color('bg1')
			cx.fillText(p.text, x+ui.rem(.5), y+ui.rem(.35))
		}

	}

	function draw_helper_points() {

		for (let p of helper_points)
			draw_helper_point(p)

		if (DEBUG_PLAN && cur_comp) {

			for (let i = 0, n = cur_comp.point_count(); i < n; i++)
				if (cur_comp.point_rc(i))
					draw_helper_point(assign(cur_comp.get_point(i, v3()),
						{text: i, type: 'point', i: i, visible: true}))

			for (let i = 0, n = cur_comp.line_count(); i < n; i++)
				if (cur_comp.line_rc(i))
					draw_helper_point(assign(cur_comp.get_line(i).at(.5, v3()),
						{text: i, type: 'line', i: i, visible: true}))

			for (let face of cur_comp.faces)
				if (face.length)
					draw_helper_point(assign(face.center(v3()),
						{text: face.i, type: 'face', i: face.i, visible: true}))

		}

	}

	// helper lines -----------------------------------------------------------

	let helper_lines_rr = gl.helper_lines_renderer()

	function helper_line(line, opt) {
		return helper_lines_rr.line(line, opt.color, opt.type, opt.visible)
	}

	// direct-manipulation tools ==============================================

	let tools = {}

	let tool // current tool
	{
		let toolname
		property(e, 'tool', () => toolname, function(name) {
			e.tooltip = ''
			if (tool && tool.bind)
				tool.bind(false)
			tool = assert(tools[name])
			toolname = name
			e.cursor = tool.cursor || name
			if (tool.bind)
				tool.bind(true)
			fire_pointermove()
		})
	}

	// orbit tool -------------------------------------------------------------

	tools.orbit = {}

	function orbit_update_cursor() {
		e.cursor = shift ? 'grab' : 'orbit'
	}

	tools.orbit.pointerdown = function(capture) {
		let cam0 = camera.clone()
		let mx0 = mouse.x
		let my0 = mouse.y
		let hit_point = mouse_hit_model({mode: 'camera'})
		let panning = shift
		mouse.prevent_validate = true
		return capture(function() {
			let mx = mouse.x
			let my = mouse.y
			if (shift == !panning) {
				cam0.set(camera)
				mx0 = mx
				my0 = my
				panning = shift
				orbit_update_cursor()
			} else {
				camera.set(cam0)
			}
			if (panning) {
				camera.pan(hit_point, mx0, my0, mx, my)
			} else {
				let dx = (mx - mx0) / 400
				let dy = (my - my0) / 400
				camera.orbit(hit_point, dy, dx, 0)
			}
			update_camera()
		})
	}

	{
	let hit_point

	tools.orbit.keydown = function(key) {
		orbit_update_cursor()
		hit_point = hit_point || mouse_hit_model({mode: 'camera'})
		let x = key == 'arrowleft' && -1 || key == 'arrowright' && 1 || 0
		let y = key == 'arrowup'   && -1 || key == 'arrowdown'  && 1 || 0
		if (!shift && ctrl && y) {
			camera.dolly(hit_point, 1 + 0.4 * (key == 'arrowdown' ? 1 : -1))
			update_camera()
			return false
		}
		if (!shift && !ctrl && (x || y)) {
			let dx = -50 * x
			let dy = -50 * y
			camera.pan(hit_point, mouse.x, mouse.y, mouse.x + dx, mouse.y + dy)
			update_camera()
			return false
		}
		if (shift && !ctrl && (x || y)) {
			let dx = x / -10
			let dy = y / -10
			camera.orbit(hit_point, dy, dx, 0)
			update_camera()
			return false
		}
	}

	tools.orbit.keyup = function(key) {
		orbit_update_cursor()
		if (key != 'shift' && key != 'control' && key != 'alt')
			hit_point = null
	}

	}

	// select tool ------------------------------------------------------------

	tools.select = {}

	function update_select_mode() {
		let mode = shift && ctrl && 'remove'
			|| shift && 'toggle' || ctrl && 'add' || null
		e.cursor = 'select' + (mode && '_' + mode || '')
		return mode
	}

	tools.select.keydown = function(key) {
		update_select_mode()
		if (key == 'escape') {
			exit_edit()
			update()
			return false
		}
		if (key == 'enter') {
			let child = cur_comp.selected_child
			if (child) {
				enter_edit(cur_path.slice().extend([child]))
				update()
			}
			return false
		}
	}

	tools.select.keyup = function() {
		update_select_mode()
	}

	tools.select.click = function(nclicks) {
		if (nclicks > 3)
			return
		let p = mouse_hit_model({mode: 'select', distance: 'select'})
		let cur_mode = update_select_mode()
		if (!p && nclicks == 1 && !cur_mode) {
			select_all(false)
		} else if (p && nclicks == 3) {
			select_all(true, false)
		} else if (p && nclicks <= 2) {
			let mode = cur_mode
			if (!mode) {
				select_all(false)
				mode = 'add'
			}
			if (p.path && p.path.equals(cur_path, 0, cur_path.length)) {
				if (p.path.length == cur_path.length) { // we've hit current component's geometry.
					if (p.line != null) {
						p.comp.select_line(p.line.i, mode, nclicks == 2)
					} else if (p.face != null) {
						p.comp.select_face(p.face, mode, nclicks == 2)
					}
				} else { // we've hit a child instance.
					if (nclicks == 2) { // edit it.
						enter_edit(p.path.slice(0, cur_path.length + 1))
					} else { // just select it.
						let child = p.path[cur_path.length]
						cur_comp.select_child(child, mode)
					}
				}
			} else {
				exit_edit()
			}
		}
		update()
	}

	tools.select.context_menu = function() {

		let p = mouse_hit_model({mode: 'select', distance: 'select'})
		if (p && p.path && p.path.equals(cur_path, 0, cur_path.length)) {
			if (p.path.length == cur_path.length) { // we've hit current component's geometry.
				if (p.line != null) {
					if (!p.comp.is_line_selected(p.line.i))
						select_all(false)
					p.comp.select_line(p.line.i, 'add')
				} else if (p.face != null) {
					if (!p.face.selected)
						select_all(false)
					p.comp.select_face(p.face, 'add')
				}
			} else { // we've hit a child instance.
				let child = p.path[cur_path.length]
				if (!child.selected)
					select_all(false)
				cur_comp.select_child(child, 'add')
			}
		} else {
			select_all(false)
		}
		update()

		function move_to_layer(item) {
			for (let child of cur_comp.children)
				if (child.selected)
					child.comp.set_child_layer(child, item.layer)
		}
		let layer_items = []
		for (let layer of layers)
			layer_items.push({text: layer.name, layer: layer, action: move_to_layer})

		let nothing_selected = !(
				cur_comp.selected_face_count() +
				cur_comp.selected_line_count() +
				cur_comp.selected_child_count()
			)

		let no_children_selected = !cur_comp.selected_child_count()

		return [
			{text: 'Group selection'   , action: group_selection   , key: 'Ctrl+G', disabled: nothing_selected},
			{text: 'Ungroup selection' , action: ungroup_selection , key: 'Ctrl+U', disabled: nothing_selected, separator: true},
			{text: 'Move to layer'     , items: layer_items, disabled: no_children_selected, separator: true},
		]

	}

	// eraser tool ------------------------------------------------------------

	tools.eraser = {}

	// move tool --------------------------------------------------------------

	{

	tools.move = {}

	tools.move.pointermove = function() {

	}

	tools.move.pointerdown = function() {

		/*
		let no_one_face_selected = !(
			p && p.comp == cur_comp
			&& p.face && p.face.selected
			&& cur_comp.selected_face_count() == 1
			&& cur_comp.selected_line_count() == 0
			&& cur_comp.selected_child_count() == 0
		)
		*/

	}

	}

	// rotate tool ------------------------------------------------------------

	tools.rotate = {}

	// line tool --------------------------------------------------------------

	tools.line = {}

	let cur_point = helper_point(v3(), {visible: false})
	let ref_point = helper_point(v3(), {visible: false, snap: 'ref_point'})
	let cur_line  = helper_line(line3(v3(), cur_point), {visible: false})
	let ref_line  = helper_line(line3(), {color: 0x000000, type: 'dashed', visible: false})

	let last_point_model = mat4()
	let ref_point_model = mat4()

	tools.line.bind = function(on) {
		if (!on) {
			tools.line.cancel()
		}
	}

	tools.line.cancel = function() {
		e.tooltip = ''
		cur_point.visible = false
		ref_point.visible = false
		cur_line .visible = false
		ref_line .visible = false
		cur_point.update()
		ref_point.update()
		cur_line .update()
		ref_line .update()
		update()
	}

	let snap_tooltips = {
		// for current point
		point: 'at point',
		line: 'on edge',
		line_middle: 'at midpoint',
		line_plane_intersection: 'on line-plane intersection',
		face: 'on face',
		// for current line
		line_point_intersection: 'on line touching point',
	}

	let line_snap_colors = {
		y_axis: y_axis_color,
		x_axis: x_axis_color,
		z_axis: z_axis_color,
		line_point_intersection: ref_color,
	}

	let future_ref_point = v3()
	let ref_point_update_after = timer(function() {

		ref_point.set(future_ref_point)
		ref_point.visible = true
		ref_point.update()

		let rel_ref_point = ref_point.clone().transform(cur_inv_model)
		mat4.mul(cur_model, ref_point_model.reset().translate(rel_ref_point), ref_point_model)

	})

	tools.line.pointermove = function() {

		let p1 = cur_line[0]
		let p2 = cur_line[1]
		p2.i = null
		p2.li = null
		p2.face = null
		p2.snap = null
		p2.line_snap = null
		p2.tooltip = null

		ref_line.snap = null
		ref_line.visible = false

		ref_point_update_after(false)

		let p = mouse_hit_model({mode: 'draw', distance: 'snap',
				axes_model: cur_line.visible ? last_point_model : null})

		let hit_d = max_hit_distances.snap

		if (p) {

			// change the ref point.
			if ((p.snap == 'point' || p.snap == 'line_middle')
				&& (p.i == null || !cur_line.visible || p.i != cur_line[0].i)
			) {
				future_ref_point.assign(p)
				ref_point_update_after(.5)
			}

			if (!cur_line.visible) { // moving the start point

				if (!p.snap) { // free-moving point.

					// snap point to axes originating at the ref point.
					if (ref_point.visible) {
						let axes_int_p = mouse_hit_axes(ref_point_model, hit_d)
						if (axes_int_p) {
							p = axes_int_p
							ref_line.snap = p.line_snap
							ref_line.set(p, ref_point)
							ref_line.visible = true
						}
					}

				}

				p1.assign(p)
				p2.assign(p)

			} else { // moving the line end-point.

				if (!p.snap) { // (semi-)free-moving point.

					// NOTE: p.line_snap makes the hit point lose one degree of freedom,
					// so there's still one degree of freedom to lose to point-snapping.

					// snap point to axes originating at the ref point.
					if (ref_point.visible) {
						p2.assign(p)
						let p_line_snap = p.line_snap
						let axes_int_p = axes_hit_line(ref_point_model, p, cur_line, hit_d)
						if (axes_int_p && screen_p2p_distance2(axes_int_p, p) <= hit_d ** 2) {
							p.assign(axes_int_p)
							ref_line.snap = axes_int_p.line_snap
							p.line_snap = p_line_snap
							ref_line.set(p, ref_point)
							ref_line.visible = true
						}

					}

					// TODO: check again if the snapped point hits the model.

				}

				p2.assign(p)

			}

		}

		p = p2

		cur_point.visible = !!p.snap
		e.tooltip = snap_tooltips[p.snap || p.line_snap] || p.tooltip
		cur_point.snap = p2.snap
		cur_line.color = line_snap_colors[p2.line_snap] ?? 0x000000
		ref_line.color = line_snap_colors[ref_line.snap] ?? 0x000000

		cur_point.update()
		cur_line.update()
		ref_line.update()

		update()
	}

	tools.line.pointerdown = function() {
		e.tooltip = ''
		let rel_cur_line = cur_line.clone().transform(cur_inv_model)
		let closing = cur_line.visible && (cur_line[1].i != null || cur_line[1].li != null)
		if (cur_line.visible) {

			cur_comp.draw_line(rel_cur_line)
			update()

			ref_point.visible = false
			ref_point.update()

			if (closing) {
				tools.line.cancel()
			} else {
				cur_line[0].assign(cur_line[1])
				cur_line.update()
			}
		} else {
			if (cur_line[0].i != null && ref_point.i == cur_line[0].i) {
				ref_point.visible = false
				ref_point.update()
			}
			cur_line.visible = true
			cur_line.update()
		}

		if (!closing) {
			mat4.mul(cur_model, last_point_model.reset().translate(rel_cur_line[1]), last_point_model)
		}

		update()
	}

	// rectangle tool ---------------------------------------------------------

	tools.rect = {}

	tools.rect.pointerdown = function() {

	}

	// push/pull tool ---------------------------------------------------------

	tools.pull = {}

	{
		let hit_p // point on the plane hit for pulling.
		let pull  // pull state for live pulling.

		tools.pull.bind = function(on) {
			if (!on)
				cancel()
		}

		tools.pull.pointermove = function() {
			if (pull) {
				move()
				return true
			} else {
				let p = mouse_hit_faces()
				let invalid_target = p && p.comp && p.comp != cur_comp
				e.cursor = 'pull'+(invalid_target ? 'no' : '')
				if (invalid_target)
					p = null
				if ((hit_p && hit_p.face) != (p && p.face)) {
					select_all(false)
					if (p)
						p.comp.select_face(p.face, 'add')
				}
				hit_p = p && (hit_p || v3()).assign(p)
				update()
			}
		}

		{
		let _line0 = line3()
		let _v0 = v3()
		function move() {
			if (!pull) {
				if (!mouse.dragging)
					return
				start()
			}
			mouse.prevent_validate = true
			let p = mouse_hit_model({mode: 'draw', distance: 'snap'})
			let hit_model = p && pull.can_hit(p)
			if (hit_model) {
				p = pull.line.project_point(p, false, _v0)
			} else {
				let int_line = mouse.ray.intersect_line(pull.line, _line0)
				p = int_line && int_line[1].to(_v0)
			}
			if (!p)
				return

			let delta_line = p.sub(pull.origin)
			let delta = sign(delta_line.dot(pull.face.plane().normal)) * delta_line.len()

			ref_line.set(origin, p)
			ref_line.visible = hit_model
			ref_line.update()

			ref_point.set(p)
			ref_point.snap = p.snap
			ref_point.visible = hit_model
			ref_point.update()

			e.tooltip = snap_tooltips[p.snap || p.line_snap] || p.tooltip

			pull.pull(delta)
			update()
		}}

		function start() {
			start_undo()
			pull = cur_comp.start_pull(hit_p)
			update()
		}

		function stop() {
			pull.stop()
			finish()
		}

		function cancel() {
			if (!pull)
				return
			undo()
			select_all(false)
			finish()
		}

		function finish() {
			pull = null
			e.tooltip = ''
			ref_point.visible = false
			ref_point.update()
			ref_line.visible = false
			ref_line.update()
			update()
		}

		tools.pull.pointerdown = function(capture) {
			if (pull) {
				stop()
			} else if (hit_p != null) {
				return capture(move, function() {
					if (pull)
						stop()
					else
						start()
				})
			}
		}

		tools.pull.cancel = cancel

	}

	// paint tool -------------------------------------------------------------

	tools.paint = {}

	function paint_node(node, material) {
		for (let face of node.comp.faces)
			if (face.mat_inst.material == default_material)
				node.comp.set_material(face, material)
		update_comp(node.comp)
	}

	tools.paint.pointerdown = function() {
		let row = materials_list && materials_list.focused_row
		let material = row && row.material || default_material
		let p = mouse_hit_faces()
		if (!p || p.snap != 'face')
			return
		if (p.comp == cur_comp) {

			cur_comp.set_material(p.face, material)

			for (let face of cur_comp.faces)
				if (face.selected)
					cur_comp.set_material(face, material)

		} else if (p.path.equals(cur_path, 0, cur_path.length)) { // we've hit a child

			paint_node(p.path.last, material)
			update_comp(p.path.last.comp)

			for (let child of cur_comp.children)
				if (child.selected)
					paint_node(child, material)

		}
		update()
	}

	// input handling ---------------------------------------------------------

	let mouse = v3(false, false, 0)
	mouse.ray = line3()

	function update_mouse() {
		let mx = ui.mx - cx
		let my = ui.my - cy
		let pos_changed = mx != mouse.x || my != mouse.y
		mouse.x = mx
		mouse.y = my
		if (pos_changed)
			camera.raycast(mx, my, mouse.ray)
		return pos_changed
	}

	function fire_pointermove() {
		if (mouse.x != mouse.x) // mouse not yet moved.
			return
		if (tool.pointermove)
			tool.pointermove()
	}

	let captured_move, captured_up
	e.capture_pointer = function(on_move, on_up) {
		captured_move = on_move
		captured_up   = on_up
	}

	e.pointermove = function() {
		update_mouse()
		fire_pointermove()
		if (captured_move)
			captured_move()
	}

	e.pointerdown = function() {
		mouse.prevent_validate = false
		if (update_mouse())
			fire_pointermove()
		if (tool.pointerdown) {
			let captured, captured_move
			function capture(move, up) {
				let mouse0 = v3()
				let _v0 = v3()
				let movewrap = move && function() {
					update_mouse()
					if (!mouse.dragging)
						mouse.dragging = mouse0.to(_v0).sub(mouse).len() > max_hit_distances.drag_pull
					move()
				}
				let upwrap = function() {
					update_mouse()
					if (up)
						up()
					mouse.dragging = false
				}
				mouse0.set(mouse)
				captured = e.capture_pointer(movewrap, upwrap)
				captured_move = move
			}
			tool.pointerdown(capture)
			// guarantee a mouse move after each mouse down.
			if (!captured)
				fire_pointermove()
			else if (captured_move)
				captured_move()
			return captured
		}
	}

	e.pointerup = function() {
		mouse.prevent_validate = false
		if (update_mouse())
			fire_pointermove()
		if (captured_up) {
			captured_up()
			captured_move = null
			captured_up = null
		} else if (tool.pointerup) {
			tool.pointerup()
			// guarantee a mouse move after each mouse up.
			fire_pointermove()
		}
	}

	e.pointerleave = function() {
		e.tooltip = ''
	}

	e.click = function(nclicks) {
		mouse.prevent_validate = false
		if (update_mouse())
			fire_pointermove()
		if (tool.click) {
			tool.click(nclicks)
			// guarantee a mouse move after each click.
			fire_pointermove()
		}
	}

	e.wheel = function() {
		let dy = ui.wheel_dy / 120
		close_context_menu()
		if (update_mouse())
			fire_pointermove()
		mouse.prevent_validate = false
		let hit_point = mouse_hit_model({mode: 'camera'})
		camera.dolly(hit_point, 1 + 0.4 * dy)
		update_camera()
		return false
	}

	let tool_keys = {
		l: 'line',
		r: 'rect',
		p: 'pull',
		o: 'orbit',
		m: 'move',
		q: 'rotate',
		b: 'paint',
		e: 'eraser',
	}

	let shift, ctrl, alt

	function update_keys() {
		shift = ui.key('shift')
		ctrl  = ui.key('control')
		alt   = ui.key('alt')
	}

	e.keydown = function(key) {
		mouse.prevent_validate = false
		update_keys()
		if (key == 'delete') {
			remove_selection()
			update()
			return false
		}
		if (key == 'h') {
			cur_comp.toggle_invisible_lines()
			update()
			return false
		}
		if (tool.keydown) {
			if (tool.keydown(key) === false) {
				return false
			}
		}
		if (key == 'escape') {
			if (tool.cancel)
				tool.cancel()
			fire_pointermove()
			return false
		}
		if (key == 'f2') {
			toogle_toolboxes()
			return false
		}
		if (key == 'g') {
			group_selection()
			return false
		}
		if (key == 'u') {
			ungroup_selection()
			return false
		}
		if (ctrl && key == 'z') {
			if (shift)
				redo()
			else
				undo()
			return false
		}
		if (ctrl && key == 'y') {
			redo()
			return false
		}
		if (shift || ctrl)
			return
		let toolname = tool_keys[key]
		if (toolname) {
			e.tool = toolname
			return false
		}
		if (key == ' ') {
			e.tool = e.tool == 'select' ? 'orbit' : 'select'
			return false
		}
	}

	e.keyup = function(key) {
		mouse.prevent_validate = false
		update_keys()
		if (!tool.keyup)
			return
		if (tool.keyup(key) === false)
			return false
	}

	// TODO
	// [alt+][ctrl+][shift+]tab switches the tab/window and makes us lose
	// keyup events on shift/ctrl/alt, so we force some keyup events on blur.
	// window.on('blur', function(ev) {
	// 	keyup('shift')
	// 	keyup('control')
	// 	keyup('alt')
	// })

	// context menu -----------------------------------------------------------

	let cmenu

	function close_context_menu() {
		if (cmenu) {
			cmenu.close()
			cmenu = null
		}
	}

	e.rightpointerdown = close_context_menu

	e.contextmenu = function() {

		close_context_menu()

		if (update_mouse(ev))
			fire_pointermove()

		let items = []

		if (tool.context_menu)
			items.extend(tool.context_menu())

		cmenu = menu({
			items: items,
		})

		cmenu.popup(e, 'inner-top', null, null, null, null, null, mouse.x, mouse.y)

		return false
	}

	// materials list ---------------------------------------------------------

	let materials_list, materials_toolbox

	function format_material(m) {
		if (m.diffuse_color == null)
			return ''
		return div({
			style: `
				width  : 48px;
				height : 48px;
				background-color: #${m.diffuse_color.base(16, 6)};
				pointer-events: none; /* dblclick pass-through */
			`
		})
	}

	function init_materials_list() {

		let rows = []
		for (let m of materials) {
			let row = [m, m.name]
			row.material = m
			rows.push(row)
		}

		rows[0].can_remove = false

		materials_list = grid({

			classes: 'x-modeleditor-materials',
			cell_h: 50,

			rowset: {
				fields: [
					{name: 'thumbnail', max_w: 50, format: format_material, type: 'thumbnail', readonly: true},
					{name: 'name', w: 50},
				],
				rows: rows,
			},

			header_visible: false,
			stay_in_edit_mode: false,
			can_exit_edit_on_errors: false,
			enable_context_menu: false,
			can_select_widget: false,

		})

		materials_list.on('focused_row_changed', function(row) {
			if (material_props)
				material_props.set_material(row && row.material)
		})

		materials_list.on('cell_click', function(ev) {
			e.tool = 'paint'
		})

		materials_list.on('cell_dblclick', function(ev) {
			material_toolbox.show()
		})

		materials_toolbox = toolbox({
			text: 'Materials',
			content: materials_list,
			target: e, side: 'right', py: 10,
			w: 160, h: 200,
		})

	}

	// material properties ----------------------------------------------------

	let material_toolbox, material_props

	function init_material_props() {

		let img = image()

		material_props = div({
			style: `
				display: flex;
			`,
		},
			img,
		)

		material_props.set_material = function(m) {
			//thumb_ct.set(m ? format_material(m) : '')
		}

		material_toolbox = toolbox({
			text: 'Material',
			content: material_props,
			target: e, side: 'right', py: 10, px: 180,
			w: 160, h: 200,
		})

	}

	// layers list ------------------------------------------------------------

	let layers_list, layers_toolbox

	function init_layers_list() {

		let rows = []
		for (let layer of layers) {
			let row = [true, layer.name]
			row.layer = layer
			rows.push(row)
		}

		rows[0].can_remove = false

		function format_visible(v) {
			return v ? div({class: 'fa fa-eye'}, '') : ''
		}

		function gen_layer_name() {
			let i = 1
			while (1) {
				let s = 'Layer '+(i++)
				if (!layers_list.lookup('name', [s]).length)
					return s
			}
		}

		layers_list = grid({

			rowset: {
				fields: [
					{name: 'visible', type: 'bool', format: format_visible, default: true},
					{name: 'name', client_default: gen_layer_name, not_null: true},
				],
				rows: rows,
				pk: 'name',
			},

			header_visible: false,
			stay_in_edit_mode: false,
			can_exit_edit_on_errors: false,
			save_new_row_on: 'insert',
			enable_context_menu: false,
			can_select_widget: false,

			init_row: function(row, ri, ev) {
				if (ev && ev.input == e) {
					row.layer = ev.layer
					return
				}
				start_undo()
				row.layer = add_layer({
					name    : this.cell_val(row, 'name'),
					visible : this.cell_val(row, 'visible')
				}, assign({index: ri}, ev))
			},

			free_row: function(row, ev) {
				if (ev && ev.input == e)
					return
				start_undo()
				remove_layer(row.layer, ev)
			},

			rows_moved: function(ri, n, insert_ri, ev) {
				if (ev && ev.input == e)
					return
				start_undo()
				move_layers(ri, n, insert_ri, ev)
			}

		})

		layers_list.on('cell_val_changed_for_visible', function(row, field, val) {
			layer_set_visibile(row.layer, val)
		})

		layers_list.on('cell_val_changed_for_name', function(row, field, val) {
			row.layer.name = val
		})

		let can_change_val = layers_list.can_change_val
		layers_list.can_change_val = function(row, field) {
			if (can_change_val(row, field))
				if (field && row && row.layer == default_layer)
					return false
			return true
		}

		layers_toolbox = toolbox({
			text: 'Layers',
			content: layers_list,
			target: e, side: 'right', py: 220,
			w: 160, h: 200,
		})

	}

	// components list --------------------------------------------------------

	let comp_list, comp_toolbox

	function init_comp_list() {

		let rows = []
		for (let comp of comps)
			if (comp != root.comp)
				rows.push([null, comp.name])

		comp_list = grid({

			rowset: {
				fields: [
					{name: 'thumbnail', w: 50, type: 'image'},
					{name: 'name', w: 50},
				],
				rows: rows,
			},

			cell_h: 50,

			header_visible: false,
			stay_in_edit_mode: false,
			can_exit_edit_on_errors: false,
			enable_context_menu: false,
			can_select_widget: false,

		})

		comp_toolbox = toolbox({
			text: 'Components',
			content: comp_list,
			target: e, side: 'right', py: 430,
			w: 160, h: 200,
		})

	}

	function group_selection() {
		// TODO:
	}

	function ungroup_selection() {
		// TODO:
	}

	// toolboxes --------------------------------------------------------------

	function init_toolboxes() {
		init_layers_list()
		init_materials_list()
		init_material_props()
		init_comp_list()
		init_toolboxes = noop
	}

	let toolboxes_on

	function toogle_toolboxes() {
		init_toolboxes()
		let on = !toolboxes_on
		layers_toolbox.show(on)
		materials_toolbox.show(on)
		material_toolbox.show(on)
		comp_toolbox.show(on)
		toolboxes_on = on
	}

	// scripting API ----------------------------------------------------------

	e.start_undo = start_undo
	e.push_undo = push_undo
	e.undo = undo
	e.redo = redo

	e.add_material = add_material
	e.default_material = default_material

	e.create_component = create_component
	e.gc_components = gc_components

	// test cube --------------------------------------------------------------

	function create_test_objects() {

		let mat1 = e.add_material({diffuse_color: 0xff9900})
		let mat2 = e.add_material({diffuse_color: 0x0099ff})

		let m = {
			points: [
				 0,  0, -1,
				 2,  0, -1,
				 2,  2,  0,
				 0,  2,  0,
				 0,  0,  2,
				 2,  0,  2,
				 2,  2,  2,
				 0,  2,  2,
				 0,  0,  0,
				-1,  1,  0,
			],
			faces: [
				{pis: [1, 0, 3, 2], material: mat1},
				{pis: [4, 5, 6, 7], material: mat1},
				{pis: [7, 6, 2, 3], material: mat2},
				//6, 2, 3,
				{pis: [4, 0, 1, 5]},
				{pis: [0, 4, 7, 3]},
				{pis: [5, 1, 2, 6]},
			],
			lines: [
				8, 9,
			],
		}

		let c0 = root.comp
		let c1 = e.create_component({name: 'c1'})

		c0.set(m)
		c1.set(m)

		c0.add_child(c1, mat4().translate(3, 0, 0))
		c0.add_child(c1, mat4().translate(6, 0, 0))

		/*
		root.comp.set_line_smoothness(0, 1)
		root.comp.set_line_smoothness(2, 1)
		root.comp.set_line_opacity(0, 0)
		root.comp.set_line_opacity(2, 0)

		let c1 = e.create_component({name: 'c1'})
		let c2 = e.create_component({name: 'c2'})
		let cg = e.create_component({name: 'cg'})

		m.faces[0].material = null
		m.faces[1].material = null

		c1.set(m)

		m.faces[2].material = null

		c2.set(m)

		c0.add_child(c1, mat4().translate(3, 0, 0).rotate(v3.y_axis, rad * 30))
		c1.add_child(c2, mat4().translate(3, 0, 0).rotate(v3.y_axis, rad * 30))
		//c1.add_child(cg, mat4())

		for (let i = 0; i < 2; i++)
			for (let j = 0; j < 2; j++)
				for (let k = 0; k < 2; k++)
					c1.add_child(c2, mat4().translate(0 + i * 3, 3 + j * 3, -5 - k * 3))

		*/

	}

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
		// root.comp.add_child(c, mat4())
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

		for (let floor of house.floors) {

			push_log('creating floor', floor.id)

			push_log('creating floor plan')

			let c = e.create_component({name: 'floor_'+floor.i})
			root.comp.add_child(c, mat4())

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
				root.comp.add_child(c, mat4())

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
							// root.comp.add_child(c, mat4())

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

	// init -------------------------------------------------------------------

	init_layers()
	init_root()
	init_renderer()
	update_sun_pos()
	//create_test_objects()
	create_plan()
	enter_edit([root])
	//enter_edit([root, root.comp.children[0]])
	update_all()

	e.tool = 'orbit'

	return e
}

let MODELEDITOR_ID         = ui.S-1
let MODELEDITOR_DRAW_STATE = ui.S+0

ui.box_widget('modeleditor', {

	create: function(cmd, id, house, fr, align, valign, min_w, min_h) {

		let s = ui.state(id)
		let me = s.get('editor')
		me ??= modeleditor({id: id, house: house})
		s.set('editor', me)

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
		let id = a[i+MODELEDITOR_ID]
		//
	},

	after_translate: function(a, i) {
		let x = a[i+0]
		let y = a[i+1]
		let w = a[i+2]
		let h = a[i+3]
		let id = a[i+MODELEDITOR_ID]
		let me = ui.state(id).get('editor')
		me.position(x, y, w, h)
	},

	draw: function(a, i) {

		let x  = a[i+0]
		let y  = a[i+1]
		let w  = a[i+2]
		let h  = a[i+3]
		let id = a[i+MODELEDITOR_ID]
		let ds = a[i+MODELEDITOR_DRAW_STATE]

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
		let id = a[i+MODELEDITOR_ID]

		if (ui.hit_box(a, i))
			ui.hover(id)

	},

})

}()) // module function
