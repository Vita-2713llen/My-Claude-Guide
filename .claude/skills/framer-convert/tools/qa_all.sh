#!/bin/bash
# Full QA gate for a published Framer conversion — every page (crawl, CMS items included), every width.
# Usage: BASE=<framer site> LIVE=<source site> tools/qa_all.sh        → writes qa_*.out next to this script
# Timing- and click-sensitive checks (motion, burger, nav-to-top) run ALONE; the layout audits run in parallel.
cd "$(dirname "$0")"
rm -f qa_*.out
echo "0/5 page errors (a broken boot() stops every animation)"
for pg in / /blog /pricing /services; do timeout 120 node dbg.js "$pg"; done > qa_errors.out 2>&1
echo "1/5 crawl" ; timeout 600 node crawl.js > qa_crawl.out 2>&1
echo "2/5 motion (load + reveal vs live)"
timeout 3500 node motionaudit.js 1440,390 > qa_motion.out 2>&1
echo "3/5 layout audits"
timeout 3500 node visaudit.js 360,390,480,600 > qa_visA.out 2>&1 &
timeout 3500 node visaudit.js 700,768,810,900 > qa_visB.out 2>&1 &
timeout 3500 node visaudit.js 992,1100,1199,1280,1440,1765,1920 > qa_visC.out 2>&1 &
timeout 3500 node wordbreak.js 360,390,768,992 > qa_words.out 2>&1 &
timeout 3500 node headlines.js 1440,1100,1920,810,390 > qa_headlines.out 2>&1 &
timeout 3500 node centerstuck.js 360,390,600,768,810,900,992,1100,1199 > qa_center.out 2>&1 &
timeout 3500 node iconcenter.js 360,768,992,1440 > qa_icon.out 2>&1 &
timeout 3000 node heights.js 1440,810,390,360 > qa_heights.out 2>&1 &
wait
echo "4/5 interactions (alone)"
(timeout 900 node slidertest.js; timeout 300 node logolink.js; timeout 3000 node clickaudit.js 1440; timeout 3000 node clickaudit.js 390; timeout 600 node burgertest.js 390 20; timeout 300 node navtop2.js 1440; timeout 300 node navtop2.js 390) > qa_interact.out 2>&1
echo "5/5 done"
echo ALLDONE
