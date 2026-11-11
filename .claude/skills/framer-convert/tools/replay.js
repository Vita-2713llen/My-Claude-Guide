// @step Replay v6 (legal pages)
const { tree } = api
const JOBS = [
["https://framerusercontent.com/assets/EqazNuWVwii6ZcUiWlbX1VGbEY.json","n9TEbYsnY"],
["https://framerusercontent.com/assets/6EKY6Ms4wWm8rzUyobfSl8mQBHg.json","AmGacRhAk"],
["https://framerusercontent.com/assets/ErDKZqQSHsPC5K99ia2RJ3kn8.json","UHo8CDTQc"],
]
const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const rid = () => Array.from({ length: 9 }, () => A[Math.floor(Math.random() * A.length)]).join("")
const out = {}
for (const [SRC, PAGE] of JOBS) {
  const b64 = (await (await fetch(SRC)).json()).z
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const data = JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text())
  const errs = {}; const E = (m) => { const k = m.slice(0, 120); errs[k] = (errs[k] || 0) + 1 }
  let bps = tree.get(PAGE).$breakpoints
  const bp0 = bps[0].id, W = { 810: bps[1].id, 390: bps[2].id }
  for (const c of [...(tree.get(bp0).children || [])]) tree.remove(c.id)
  const allTok = tree.getNodesOfTypes("ColorStyleTokenNode"), allPre = tree.getNodesOfTypes("TextStylePresetNode")
  const tokById = {}, preById = {}
  for (const t of data.tokens) { let n = allTok.find(x => x.name === t.name); if (!n) n = tree.insert("ColorStyleTokenNode", "t6" + t.key.replace(/\W/g, "") + PAGE.slice(0,3), { name: t.name, light: t.light }); tokById[t.key] = n.id }
  for (const p of data.presets) {
    let n = allPre.find(x => x.name === p.name)
    if (!n) {
      n = tree.insert("TextStylePresetNode", "p6" + p.key + PAGE, { parent: tree.root, name: p.name, ...p.attrs, textColor: "var(--token-uEP07Lemd)" })
      const [a, b, c] = p.slots
      try { if (a !== b || b !== c) { tree.patch(n.id, { breakpoint: { medium: { fontSize: b + "px" } } }); if (b !== c) { tree.patch(n.id, { breakpoint: { small: { fontSize: c + "px" } } }); tree.patch(n.id, { "breakpoint.medium.minWidth": "810px" }) } } } catch (e) { E("preset bp: " + e.message) }
    }
    preById[p.key] = n.id
  }
  const firstOf = (col) => tree.get(col).children[0].id
  const sub = (v) => {
    if (typeof v === "string") { if (v.startsWith("$preset:")) return preById[v.slice(8)]; if (v.startsWith("$first:")) return firstOf(v.slice(7)); return v.replace(/var\(--\$tok:([^)]+)\)/g, (m, k) => `var(--token-${tokById[k]})`) }
    if (Array.isArray(v)) return v.map(sub)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]))
    return v
  }
  let total = 0
  for (const sec of data.sections) {
    const urls = [...new Set(sec.ops.filter(o => o.asset).map(o => o.asset))]
    const refs = {}
    await Promise.all(urls.map(async u => { try { refs[u] = await tree.assetReference(u) } catch (e) { E("asset: " + e.message) } }))
    const ids = {}
    for (const o of sec.ops) {
      const attrs = sub(o.attrs)
      if (attrs.overflowY === "visible") delete attrs.overflowY
      if (attrs.overflowX === "visible") delete attrs.overflowX
      if (o.type === "SVGNode") delete attrs.pointerEvents
      if (typeof attrs.name === "string") attrs.name = attrs.name.replace(/\s*\[data-(wf|w)-[^\]]*(\]\]\]|\])+/g, "").trim()
      try {
        if (o.op === "insert") {
          if (o.asset && refs[o.asset]) attrs.fill = refs[o.asset]
          const parent = o.parent ? ids[o.parent] : bp0
          if (!parent) { E("missing parent"); continue }
          ids[o.key] = tree.insert(o.type, rid(), { ...attrs, parent }).id; total++
        } else if (o.op === "replica") { if (ids[o.key] && W[o.w]) tree.patch(W[o.w] + ids[o.key], attrs) }
      } catch (e) { E(o.op + " " + (o.type || "") + ": " + e.message) }
    }
  }
  const first = tree.get(bp0).children[0]
  if (first) tree.patch(first.id, { codeOverride: "codeFile/S5ZdENK:withVerdovaMotion" })
  out[PAGE] = total + (Object.keys(errs).length ? " " + JSON.stringify(errs) : "")
}
const v = await api.publishing.publish()
return { out, v: v.version.id }