// @step Replay __LABEL__
const { tree } = api
const JOBS = __JOBS__
const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const rid = () => Array.from({ length: 9 }, () => A[Math.floor(Math.random() * A.length)]).join("")
const tok = Object.fromEntries(tree.getNodesOfTypes("ColorStyleTokenNode").map(t => [t.name, t.id]))
const pre = Object.fromEntries(tree.getNodesOfTypes("TextStylePresetNode").map(t => [t.name, t.id]))
const out = {}
for (const [SRC, TARGET, BPS] of JOBS) {
  const b64 = (await (await fetch(SRC)).json()).z
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const data = JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text())
  const errs = {}; const E = (m) => { const k = m.slice(0, 140); errs[k] = (errs[k] || 0) + 1 }
  const [bp0, bpT, bpM] = BPS
  const W = { 810: bpT, 390: bpM }
  for (const c of [...(tree.get(bp0).children || [])]) if (c.type !== "PlaceholderNode") tree.remove(c.id)
  const details = []
  const sub = (v) => {
    if (typeof v === "string") { if (v.startsWith("$preset:")) return pre[v.slice(8)]; return v.replace(/var\(--\$tok:([^)]+)\)/g, (m, k) => tok[k] ? `var(--token-${tok[k]})` : m) }
    if (Array.isArray(v)) return v.map(sub)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]))
    return v
  }
  let total = 0
  const roots = []
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
      let det = null
      if (attrs.link && typeof attrs.link.href === "string" && attrs.link.href.startsWith("$detail:")) { det = attrs.link.href; delete attrs.link }
      if (typeof attrs.name === "string") attrs.name = attrs.name.replace(/\s*\[data-(wf|w)-[^\]]*(\]\]\]|\])+/g, "").trim()
      try {
        if (o.op === "insert") {
          if (o.asset && refs[o.asset]) attrs.fill = refs[o.asset]
          const parent = o.parent ? ids[o.parent] : bp0
          if (!parent) { E("missing parent"); continue }
          const n = tree.insert(o.type, rid(), { ...attrs, parent })
          ids[o.key] = n.id; total++
          if (!o.parent) roots.push(n.id)
          if (det) details.push([n.id, det])
        } else if (o.op === "replica") { if (ids[o.key] && W[o.w]) tree.patch(W[o.w] + ids[o.key], attrs) }
      } catch (e) { E(o.op + " " + (o.type || "") + ": " + e.message) }
    }
  }
  for (const r of roots) { try { tree.patch(r, { htmlTag: "section" }) } catch (e) {} }
  await api.store("details:" + TARGET, details)
  out[TARGET] = { total, roots: roots.length, details: details.length, errs }
}
return out
