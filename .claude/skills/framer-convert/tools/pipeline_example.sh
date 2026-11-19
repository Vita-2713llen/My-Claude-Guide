#!/bin/bash
# full rebuild: measure -> native -> resolve for every page
S=/tmp/claude-0/-home-user-My-Claude-Guide/ff0ef4c1-2418-5719-bd81-8c90a65ed9a9/scratchpad
M=/home/user/My-Claude-Guide/.claude/skills/framer-convert/tools/measure.cjs
B=https://civica-128.webflow.io
cd $S
PAGES="home: about:about-us services:services departments:departments values:our-values pricing:pricing faq:faq testimonials:testimonials blog:blog contact:contact-us team:our-team service-detail:services/accessible-by-law department-detail:departments/clerk-and-records team-detail:team/margit-brauer blog-detail:blog-posts/closing-the-books-on-the-first"
if [ "$1" != "nomeasure" ]; then
  n=0
  for pp in $PAGES; do d=${pp%%:*}; u=${pp#*:}; rm -rf m/$d; node $M "$B/$u" m/$d >/dev/null 2>&1 & n=$((n+1)); [ $((n%4)) = 0 ] && wait; done
  rm -rf m/chrome; CHROME=".civica-header|.section.footer" ONLY_CHROME=1 node $M $B/ m/chrome >/dev/null 2>&1; wait
fi
FM='[["newsreader","Newsreader"],["inter","Inter"]]'
rm -rf n
for pp in $PAGES chrome:; do d=${pp%%:*}; FONT_MAP="$FM" node work/native.cjs m/$d n/$d/sec >/dev/null 2>&1 || echo "native fail $d"; mv n/$d/spec-bundle.json n/$d/bundle.json; done
python3 -I work/resolve.py n dl_civica/site.css r | head -17
