#!/bin/bash
# live page → resolved, compressed bundle: run.sh <name> <live path>
set -e
export KEEP_STATES="${KEEP_STATES:-.price-figure-alt,.cases-row-text:not(.cases-row-text-on)}" AUTO_MARGIN=/home/user/stand/live/auto-margin.json QODERS_NODE_MODULES=/home/user/stand/node_modules PLAYWRIGHT=/opt/node22/lib/node_modules/playwright
N=$1; P=$2; T=/home/user/stand/tools
node $T/snap.cjs "https://noverde-128.webflow.io/$P" $N.raw.html >/dev/null
node $T/prep.cjs $N.raw.html $N.html https://noverde-128.webflow.io/
node $T/measure.cjs $N.html m-$N 1440,810,390 > m-$N.log 2>&1
mkdir -p w-$N && node $T/native.cjs m-$N w-$N/n > n-$N.log 2>&1
cp w-$N/spec-bundle.json b-$N.json
node $T/resolve.cjs b-$N.json ../pages/ds.json r-$N.json | cut -c1-300
sed -i 's#Verdova/rgba(0, 0, 0, 0)#Transparent#g' r-$N.json
node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync('zj-$N.json',JSON.stringify({z:z.gzipSync(fs.readFileSync('r-$N.json')).toString('base64')}))"
ls -la zj-$N.json | awk '{print $5}'
