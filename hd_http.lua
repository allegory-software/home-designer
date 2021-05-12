
local ffi = require'ffi'
ffi.tls_libname = 'tls_bearssl'
--ffi.tls_libname = 'tls_libressl'
local server = require'http_server'
--local libtls = require'libtls'
--libtls.debug = print
local respond = require'webb'
require'hd'

local server = server:new{
	libs = 'sock sock_libtls zlib',
	listen = {
		{
			--host = 'localhost',
			tls = true,
			tls_options = {
				cert_file = 'localhost.crt',
				key_file  = 'localhost.key',
			},
		},
	},
	debug = {
		--protocol = true,
		--stream = true,
		tracebacks = true,
	},
	respond = respond,
}

server.start()
