#!/bin/bash
# re-run native → resolve → bundle on existing measurements: rn.sh <name>
set -e
export QODERS_NODE_MODULES=/home/user/stand/node_modules AUTO_MARGIN=/home/user/stand/live/auto-margin.json
N=$1; T=/home/user/stand/tools
mkdir -p w-$N && node $T/native.cjs m-$N w-$N/n > n-$N.log 2>&1
cp w-$N/spec-bundle.json b-$N.json
node $T/resolve.cjs b-$N.json ../pages/ds.json r-$N.json > /dev/null
sed -i 's#Verdova/rgba(0, 0, 0, 0)#Transparent#g' r-$N.json
node -e "const z=require('zlib'),fs=require('fs');fs.writeFileSync('zj-$N.json',JSON.stringify({z:z.gzipSync(fs.readFileSync('r-$N.json')).toString('base64')}))"
