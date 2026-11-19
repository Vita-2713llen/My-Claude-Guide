// pack.cjs <in.json> <out.json> : {"z": base64(gzip(json))}
const fs=require('fs'),zlib=require('zlib');const [, ,i,o]=process.argv;
fs.writeFileSync(o,JSON.stringify({z:zlib.gzipSync(fs.readFileSync(i)).toString('base64')}));console.log(o,fs.statSync(o).size);
