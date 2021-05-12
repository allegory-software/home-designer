
require'$'
require'webb'
require'webb_query'
require'webb_auth'
require'hd_conf'
local sock = require'sock'

sock.run(function()

	auth_install()

end)
