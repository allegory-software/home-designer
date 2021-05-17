
if not ... then require'hd_http'; return end

require'$'
require'webb'
require'webb_action'
require'webb_query'

require'xrowset'
require'xrowset_mysql'
require'xmodule'
require'webb_js'
--require'x_dba'

require'hd_conf'

--require'hd_install'

config('root_action', 'hd')

cssfile[[
fontawesome.css
x-widgets.css
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
]]

js[[

// ---------------------------------------------------------------------------
// widgets
// ---------------------------------------------------------------------------

component('hd-main', 'Home Designer', function(e) {

	selectable_widget(e)



})

// ---------------------------------------------------------------------------
// main app
// ---------------------------------------------------------------------------

init_xmodule({
	modules: {
		hd  : {icon: 'rocket'},
		dba : {icon: 'database'},
		dev : {icon: 'user-cog'},
	},
	slots: {
		base   : {color: '#fff', icon: 'rocket'},
		app    : {color: '#fff', icon: 'rocket'},
		lang   : {color: '#0f0', icon: 'globe-europe'},
		lang2  : {color: '#0f0', icon: 'globe-americas'},
		server : {color: '#000', icon: 'server'},
		user   : {color: '#99f', icon: 'user'},
	},
	layers: [
		//{slot: 'base'   , module: 'dba' , layer: 'dba'            },
		//{slot: 'lang'   , module: 'dba' , layer: 'dba'            },
		//{slot: 'server' , module: 'dba' , layer: 'dba-server'     },
		{slot: 'base'   , module: 'hd'  , layer: 'hd'             },
		//{slot: 'app'    , module: 'dba' , layer: 'ck'             },
		{slot: 'lang2'  , module: 'hd'  , layer: 'hd'             },
		{slot: 'lang'   , module: 'hd'  , layer: 'hd'             },
		{slot: 'server' , module: 'hd'  , layer: 'hd-server'      },
		{slot: 'user'   , module: 'hd'  , layer: 'hd-user-admin'  },
		//{slot: 'user'   , module: 'dba' , layer: 'ck-user-cosmin' },
		{slot: 'user'   , module: 'dev' , layer: 'hd-user-cosmin' },
	],
	root_module: 'hd',
	root_container: '#root_container',
})

]]

body = [[

<div id=root_container></div>

]]

action.hd = function(...)

	webbjs{
		head = '',
		body = body,
		title = 'Home Designer',
	}

end

return function()
	check(action(find_action(unpack(args()))))
end

