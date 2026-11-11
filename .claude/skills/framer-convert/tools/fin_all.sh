#!/bin/bash
cd "$(dirname "$0")"
rm -f fin_*.out
timeout 3500 node visaudit.js 360,390,480,600 > fin_visA.out 2>&1 &
timeout 3500 node visaudit.js 700,768,810,900 > fin_visB.out 2>&1 &
timeout 3500 node visaudit.js 992,1100,1199,1280,1440,1765,1920 > fin_visC.out 2>&1 &
timeout 3500 node iconcenter.js 360,768,992,1440 > fin_icon.out 2>&1 &
timeout 3500 node centertext.js 360,390,768,992 > fin_center.out 2>&1 &
(timeout 900 node slidertest.js; timeout 300 node navtop2.js 1440; timeout 300 node navtop2.js 390) > fin_slider.out 2>&1 &
timeout 3000 node heights.js 1440,810,390,360 > fin_heights.out 2>&1 &
wait
echo ALLDONE
