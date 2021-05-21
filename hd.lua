
if not ... then require'hd_http'; return end

require'$'
require'webb'
require'webb_action'
require'webb_query'
require'webb_spa'

require'xrowset'
require'xrowset_mysql'
require'xmodule'
--require'x_dba'

require'hd_conf'

--require'hd_install'

cssfile[[
fontawesome.css
x-widgets.css
x-auth.css
hd.css
]]

jsfile[[
3d.js
gl.js
earcut.js
suncalc.js
gl-renderer.js
x-widgets.js
x-nav.js
x-input.js
x-listbox.js
x-grid.js
x-model3.js
x-modeleditor.js
x-module.js
x-auth.js
hd.js
]]

action['test.json'] = function()
	return {
		items = {
			{name = 'Dude1'},
			{name = 'Dude2'},
		},
	}
end

action['404.html'] = function()
	spa{
		head = '',
		body = wwwfile('hd.html'),
		title = 'Home Designer',
		client_action = true,
		--js_mode = 'embed',
		--css_mode = 'embed',
	}
end

return function()
	check(action(unpack(args())))
end

