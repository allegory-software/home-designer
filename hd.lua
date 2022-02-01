--go@ x:\sdk\bin\windows\luajit.exe -lscite x:\hd\hd.lua -v start
local ffi = require'ffi'
ffi.tls_libname = 'tls_bearssl'

require'$daemon'
local xapp = require'xapp'

require'xmodule'

local hd = daemon'hd'
hd.font = 'opensans'
local hd = xapp(hd)

config('db_port', 3307)
config('db_pass', 'root')

config('secret', 'auf9#8xc@klX0cz09xsdf8s8as9df~24lf_a')

config('minify_js', true)

--require'hd_install'

cssfile[[
hd.css
]]

jsfile[[
3d.js
gl.js
earcut.js
suncalc.js
gl-renderer.js
x-model3.js
x-modeleditor.js
hd.js
]]

html(function()
	return reload(indir(app_dir, 'hd.html'))
end)

function hd.spa(action)
	return {
		title = 'Home Designer',
		client_action = true,
		--js_mode = 'embed',
		--css_mode = 'embed',
	}
end

return hd:run(...)
