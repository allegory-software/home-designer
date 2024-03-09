@echo off

du -shc www/*.js www2/*.js
echo.

cat www/*.js www2/*.js | gzip - > all.js.gz
du -sh all.js.gz
echo.

cat www/*.js www2/*.js | jsmin | gzip - > all.min.js.gz
du -sh all.min.js.gz
echo.

wc -l www/*.js www2/*.js
echo.

rm all.js.gz
rm all.min.js.gz
