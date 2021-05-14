
if not ... then require'hd_http'; return end

require'$'
require'webb'
require'webb_action'
require'webb_query'

require'xrowset'
require'xrowset_mysql'
require'xmodule'
--require'x_dba'

require'hd_conf'

--require'hd_install'

config('root_action', 'hd.html')

return function()
	check(action(find_action(unpack(args()))))
end

