
local ffi = require'ffi'
ffi.tls_libname = 'tls_bearssl'
--ffi.tls_libname = 'tls_libressl'
--local libtls = require'libtls'
--libtls.debug = print

require'$'
require'webb'
require'webb_action'
require'webb_query'
require'webb_spa'

require'xrowset'
require'xrowset_sql'
require'xmodule'
--require'x_dba'

require'hd_conf'

math.randomseed(require'time'.time())

config('app_name', 'hd')

config('var_dir', '.')

config('db_port', 3307)
config('db_pass', 'abcd12')

config('session_secret', 'auf9#8xc@kl~24lf_a')
config('pass_salt', 'ig9sd8l#la;,3xj')

config('minify_js', true)

--require'hd_install'

cssfile[[
fontawesome.css
x-widgets.css
x-auth.css
hd.css
]]

jsfile[[
markdown-it.js
markdown-it-easy-tables.js
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

if ... == 'hd' then --used as module, required by webb_respond() call.
	return function()
		checkfound(action(unpack(args())))
	end
end

local server = http_server()
server.start()

