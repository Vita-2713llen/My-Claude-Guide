#!/bin/bash
# Full QA gate for a published Framer conversion — every page (crawl, CMS items included), every width.
# Usage: BASE=<framer site> LIVE=<source site> tools/qa_all.sh        → writes qa_*.out next to this script
# Motion timing is CPU-sensitive, so the motion audit runs ALONE first; the layout audits then run in parallel.
cd "$(dirname "$0")"
rm -f qa_*.out
echo "1/3 crawl" ; timeout 600 node crawl.js > qa_crawl.out 2>&1
echo "2/3 motion (load + reveal vs live)"
timeout 3500 node motionaudit.js 1440,390 > qa_motion.out 2>&1
echo "3/3 layout audits"
timeout 3500 node visaudit.js 360,390,480,600 > qa_visA.out 2>&1 &
timeout 3500 node visaudit.js 700,768,810,900 > qa_visB.out 2>&1 &
timeout 3500 node visaudit.js 992,1100,1199,1280,1440,1765,1920 > qa_visC.out 2>&1 &
timeout 3500 node wordbreak.js 360,390,768,992 > qa_words.out 2>&1 &
timeout 3500 node centerstuck.js 360,390,600,768,810,900,992,1100,1199 > qa_center.out 2>&1 &
timeout 3500 node iconcenter.js 360,768,992,1440 > qa_icon.out 2>&1 &
(timeout 900 node slidertest.js; timeout 600 node burgertest.js 390 20; timeout 300 node navtop2.js 1440; timeout 300 node navtop2.js 390) > qa_interact.out 2>&1 &
timeout 3000 node heights.js 1440,810,390,360 > qa_heights.out 2>&1 &
wait
echo ALLDONE
