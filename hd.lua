--go@ x:\sdk\bin\windows\luajit.exe -lscite x:\hd\hd.lua --debug -v run
--go@ plink d10 strace ~/sdk/bin/linux/luajit -lscite ~/hd/hd.lua -v start

local hd = require('$xapp')('hd', ...)

load_opensans()

config('https_addr', false)

config('db_port', 3307)
config('db_pass', 'root')

config('secret', 'auf9#8xc@klX0cz09xsdf8s8as9df~24lf_a')

config('minify_js', true)
config('favicon_href', '/favicon1.ico')

cssfile[[
x-modeleditor.css
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
	return reload(indir(hd.dir, 'hd.html'))
end)

config('page_title_suffix', 'Home Designer')

return hd:run(...)
