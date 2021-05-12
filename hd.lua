
if not ... then require'hd_http'; return end

require'$'
require'webb'
require'webb_action'
require'webb_query'

--require'xrowset'
--require'xmodule'
--require'x_dba'

require'hd_conf'

--require'hd_install'

config('root_action', 'app')

action.app = function()
	out'hello'
end

return function()
	check(action(find_action(unpack(args()))))
end

