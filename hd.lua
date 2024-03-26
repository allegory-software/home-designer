--go@ x:\sdk\bin\windows\luajit.exe -lscite x:\hd\hd.lua -vv run
--go@ plink d10 strace ~/sdk/bin/linux/luajit -lscite ~/hd/hd.lua -v start

local function hd_schema()

	--

end

require'glue'
config('www_dirs', 'www;sdk/www;sdk/canvas-ui/www')

local xapp = require'xapp'

local hd = xapp(...)

--config('minify_js', true)
config('favicon_href', '/favicon256.svg')
config('page_title_suffix', 'Home Designer')
config('dev_email', 'cosmin.apreutesei@gmail.com')

jsfile[[
earcut.js
3d.js
plane-graph.js
gl.js
gl-renderer.js
suncalc.js
model3.js
model3-editor.js
house-plan.js
house-plan-editor.js
house-model-editor.js
tests.js
]]

htmlfiles'hd.html'

hd.schema:import(hd_schema)

return hd:run()
