
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
	//root_module: 'hd',
	//root_container: '#xmodule_root_container',
})

//action.en = function() {}

document.on('theme_changed', function(theme) {
	if (window.hd_modeleditor)
		hd_modeleditor.background_color = theme == 'dark' ? '#151519' : '#ffffff'
})
