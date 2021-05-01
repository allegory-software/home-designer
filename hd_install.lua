
local function pass(...)
	print_queries(false)
	return ...
end
local function pq(sql, ...)
	print_queries'both'
	return pass(query(sql, ...))
end

--ddl commands
qsubst'table  create table if not exists'

--type domains
qsubst'id      int unsigned'
qsubst'pk      int unsigned primary key auto_increment'
qsubst'name    varchar(64) character set utf8 collate utf8_general_ci'
qsubst'email   varchar(128) character set utf8 collate utf8_general_ci'
qsubst'hash    varchar(40) character set ascii' --hmac_sha1 in hex
qsubst'url     varchar(2048) character set utf8 collate utf8_general_ci'
qsubst'bool    tinyint not null default 0'
qsubst'bool1   tinyint not null default 1'
qsubst'ctime   timestamp not null'
qsubst'mtime   timestamp not null on update current_timestamp'
qsubst'money   decimal(20,6)'
qsubst'qty     decimal(20,6)'
qsubst'percent decimal(20,6)'
qsubst'lang    char(2) character set ascii not null'

--drop everything

droptable'usr'
droptable'usrtoken'

--create everything

pq[[
$table usr (
	uid         $pk,
	anonymous   $bool1,
	email       $email,
	emailvalid  $bool,
	pass        $hash,
	facebookid  $name,
	googleid    $name,
	gimgurl     $url,
	active      $bool1,
	name        $name,
	phone       $name,
	gender      $name,
	birthday    date,
	newsletter  $bool,
	admin       $bool,
	note        text,
	clientip    $name,
	promocode   $name,
	codesent    bool,
	atime       timestamp not null default 0,
	ctime       $ctime,
	mtime       $mtime
);
]]

pq[[
$table usrtoken (
	token       $hash not null primary key,
	uid         $id not null,
	ctime       $ctime
);
]]

