--go@ x:\sdk\bin\windows\luajit.exe -lscite x:\apps\hd\hd.lua -vv run
--go@ plink d10 strace ~/sdk/bin/linux/luajit -lscite ~/hd/hd.lua -v start

local function hd_schema()

	--

end

local xapp = require'xapp'

local hd = xapp(...)

load_opensans()

--config('minify_js', true)
config('favicon_href', '/favicon1.ico')
config('page_title_suffix', 'Home Designer')
config('dev_email', 'cosmin.apreutesei@gmail.com')

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

htmlfile'hd.html'

hd.schema:import(hd_schema)

cmd('install [forealz]', 'Install or migrate the app', function(opt, doit)
	create_db()
	local dry = doit ~= 'forealz'
	db():sync_schema(hd.schema, {dry = dry})
	if not dry then
		insert_or_update_row('tenant', {
			tenant = 1,
			name = 'test',
			host = config'domain',
		})
		usr_create_or_update{
			tenant = 1,
			email = config'dev_email',
			roles = 'dev admin',
		}
	end
	say'Install done.'
end)

return hd:run()
