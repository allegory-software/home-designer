
require'$'
require'webb'
require'webb_action'
require'webb_query'

--require'xrowset'
--require'xmodule'
--require'x_dba'

config('db_name', 'hd')
config('db_pass', 'abcd12')

require'hd_conf'

config('root_action', 'app')

action.app = function()
	out'hello'
end

return function()
	check(action(find_action(unpack(args()))))
end

