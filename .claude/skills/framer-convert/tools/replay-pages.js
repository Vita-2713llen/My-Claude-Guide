const { tree } = api
const JOBS = __JOBS__
const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const rid = () => Array.from({ length: 9 }, () => A[Math.floor(Math.random() * A.length)]).join("")
const load = async (u) => { const b64 = (await (await fetch(u)).json()).z; const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); return JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text()) }
const tokByName = Object.fromEntries(tree.getNodesOfTypes("ColorStyleTokenNode").map(t => [t.name, t.id]))
const preByName = Object.fromEntries(tree.getNodesOfTypes("TextStylePresetNode").map(t => [t.name, t.id]))
const cols = {}, items = {}
for (const c of tree.getNodesOfTypes("CollectionNode")) { const key = c.name.toLowerCase(); cols[key] = c.id; const slugVar = c.variables.find(v => v.type === "slug"); items[key] = Object.fromEntries((c.children || []).map(i => [i[`$control__${slugVar.id}`], i.id])) }
const out = {}
for (const [SRC, PAGE, PARENT] of JOBS) {
  const data = await load(SRC)
  const errs = {}; const E = (m) => { const k = String(m).slice(0, 140); errs[k] = (errs[k] || 0) + 1 }
  let bp0, W
  if (PARENT) { bp0 = PARENT.bp0; W = PARENT.W }
  else {
    let bps = tree.get(PAGE).$breakpoints
    bp0 = bps[0].id
    tree.patch(bp0, { name: "Desktop", layout: "stack", stackDirection: "vertical", height: "auto", overflow: "clip" })
    if (bps.length < 2) tree.createVariant(bp0, "bt" + rid(), { gesture: null, width: "810px", name: "Tablet", left: "1300px" })
    bps = tree.get(PAGE).$breakpoints
    if (bps.length < 3) tree.createVariant(bp0, "bm" + rid(), { gesture: null, width: "390px", name: "Mobile", left: "2210px" })
    bps = tree.get(PAGE).$breakpoints
    W = { 810: bps[1].id, 390: bps[2].id }
    for (const c of [...(tree.get(bp0).children || [])]) tree.remove(c.id)
  }
  const sub = (v) => {
    if (typeof v === "string") {
      if (v.startsWith("$preset:")) return preByName[data.pre[v.slice(8)]] || E("preset " + v)
      return v.replace(/var\(--\$tok:([^)]+)\)/g, (m, k) => tokByName[data.tok[k]] ? `var(--token-${tokByName[data.tok[k]]})` : (E("tok " + k), "rgba(0,0,0,0)"))
    }
    if (Array.isArray(v)) return v.map(sub)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]))
    return v
  }
  let total = 0
  const ids = {}
  for (const sec of data.sections) {
    if (PARENT && PARENT.only && !PARENT.only.includes(sec.name)) continue
    const urls = [...new Set(sec.ops.filter(o => o.asset).map(o => o.asset))]
    const refs = {}
    await Promise.all(urls.map(async u => { try { refs[u] = await tree.assetReference(u) } catch (e) { E("asset: " + u.slice(-40)) } }))
    for (const o of sec.ops) {
      const attrs = sub(o.attrs)
      if (attrs.overflowY === "visible") delete attrs.overflowY
      if (attrs.overflowX === "visible") delete attrs.overflowX
      if (o.type === "SVGNode") delete attrs.pointerEvents
      if (attrs.link && typeof attrs.link.href === "string" && attrs.link.href.includes("$COL:")) {
        const m = attrs.link.href.match(/\$COL:(\w+)/); const col = m[1]
        attrs.link = { ...attrs.link, href: attrs.link.href.replace(/\$COL:\w+/, cols[col]) }
        if (attrs.link.collectionItem) attrs.link.collectionItem = items[col][attrs.link.collectionItem] || Object.values(items[col])[0]
      }
      try {
        if (o.op === "insert") {
          if (o.asset) { if (refs[o.asset]) attrs.fill = refs[o.asset]; else delete attrs.fill }
          const parent = o.parent ? ids[o.parent] : bp0
          if (!parent) { E("missing parent"); continue }
          ids[o.key] = tree.insert(o.type, rid(), { ...attrs, parent }).id; total++
        } else if (o.op === "replica") { if (ids[o.key] && W[o.w]) tree.patch(W[o.w] + ids[o.key], attrs) }
      } catch (e) {
        // retry without the offending key
        const bad = (String(e.message).match(/`\{ (\w+)/) || [])[1]
        if (bad && o.op === "insert") { E(o.type + " drop " + bad + ": " + String(e.message).slice(60, 160)); delete attrs[bad]; try { const parent = o.parent ? ids[o.parent] : bp0; ids[o.key] = tree.insert(o.type, rid(), { ...attrs, parent }).id; total++ } catch (e2) { E("insert2 " + o.type + ": " + e2.message) } }
        else E(o.op + " " + (o.type || "") + ": " + e.message)
      }
    }
  }
  out[PAGE || "parent"] = { total, errs }
}
return out
