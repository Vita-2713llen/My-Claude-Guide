# Global design-system resolve for every page bundle (native.cjs output) of one site.
# Colours -> tokens named after the source CSS variables (no digits), text presets deduped site-wide and named by role,
# brand rename, emails -> info@example.com, links -> Framer paths (detail links keep a $detail marker for replay).
# Usage: python3 -I resolve.py <n-dir> <site.css> <out-dir>
import json, os, re, sys, collections, gzip, base64

ND, CSS, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
OLD, NEW = 'Civica', 'Tovia'
LIVE = re.compile(r'^https?://civica-128\.webflow\.io')
DROP = {'style-guide', 'licenses', 'licensing', 'changelog', 'password', 'blog-categories'}
PAGE_PATHS = {'': '/', 'about-us': '/about-us', 'services': '/services', 'departments': '/departments', 'our-values': '/our-values', 'pricing': '/pricing',
              'faq': '/faq', 'testimonials': '/testimonials', 'blog': '/blog', 'contact-us': '/contact-us', 'our-team': '/our-team'}
DETAIL = {'services': 'services', 'departments': 'departments', 'team': 'team', 'blog-posts': 'blog-posts'}

# ---------- colours ----------
def parse(c):
    c = c.strip()
    m = re.match(r'^#([0-9a-f]{3,8})$', c, re.I)
    if m:
        h = m.group(1)
        if len(h) in (3, 4): h = ''.join(x * 2 for x in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
        return (r, g, b, round(a, 2))
    m = re.match(r'^rgba?\(([^)]+)\)$', c)
    if not m: return None
    p = [float(x) for x in re.split(r'[\s,/]+', m.group(1).strip()) if x]
    return (int(p[0]), int(p[1]), int(p[2]), round(p[3], 2) if len(p) > 3 else 1)

css = open(CSS).read()
root = re.search(r':root\s*{([^}]*)}', css).group(1)
VARS = {}
for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;]+)', root):
    c = parse(v.strip())
    if c and c not in VARS: VARS[c] = k

def var_name(k):
    k = re.sub(r'^--(primary|secondary|_colors-*)-*', '', k)
    k = re.sub(r'-?\d+-?percent', '', k)
    k = re.sub(r'\d+', '', k)
    return ' '.join(w.capitalize() for w in re.split(r'[-_]+', k) if w) or 'Colour'

BASES = {(255, 255, 255): 'White', (0, 0, 0): 'Black', (6, 8, 15): 'Brand', (29, 75, 243): 'Accent', (10, 20, 64): 'Deep'}
ALPHA_WORDS = ['Trace', 'Ghost', 'Faint', 'Whisper', 'Mist', 'Haze', 'Veil', 'Glass', 'Soft', 'Half', 'Muted', 'Medium', 'Strong', 'Dense', 'Heavy', 'Rich', 'Bold', 'Solid', 'Full', 'Max']
used_colors = collections.Counter()
COLOR_RE = re.compile(r'rgba?\([^)]*\)|#[0-9a-fA-F]{6,8}\b')

def scan(v):
    if isinstance(v, str):
        for m in COLOR_RE.findall(v):
            c = parse(m)
            if c and c[3] > 0: used_colors[c] += 1
    elif isinstance(v, list):
        for x in v: scan(x)
    elif isinstance(v, dict):
        for x in v.values(): scan(x)

bundles = {}
for d in sorted(os.listdir(ND)):
    f = os.path.join(ND, d, 'bundle.json')
    if os.path.exists(f): bundles[d] = json.load(open(f))
for b in bundles.values():
    for name, spec in b.items():
        if name.startswith('$'): continue
        for o in spec['ops']:
            for k in ('fill', 'textColor', 'borderColor'):
                if k in o['attrs']: scan(o['attrs'][k])

TOK = {}
names_taken = set()
def uniq(n):
    base, i = n, 0
    alts = ['Alt', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
    while n in names_taken: n = base + ' ' + alts[i]; i += 1
    names_taken.add(n); return n
# solid colours first, then alpha variants grouped by base
solids = sorted([c for c in used_colors if c[3] == 1], key=lambda c: -used_colors[c])
for c in solids:
    n = var_name(VARS[c]) if c in VARS else BASES.get(c[:3]) or None
    if not n:
        r, g, b = c[:3]; lum = (0.3 * r + 0.59 * g + 0.11 * b)
        n = ('Ink' if lum < 40 else 'Slate' if lum < 110 else 'Grey' if lum < 200 else 'Mist') if abs(r - b) < 25 else ('Blue' if b > r else 'Warm')
    TOK[c] = uniq(n)
by_base = collections.defaultdict(list)
for c in used_colors:
    if c[3] < 1: by_base[c[:3]].append(c)
for base, cs in by_base.items():
    cs.sort(key=lambda c: c[3])
    bn = TOK.get(base + (1,)) or BASES.get(base)
    if not bn:
        r, g, b = base; lum = (0.3 * r + 0.59 * g + 0.11 * b)
        bn = 'Ink' if lum < 60 else 'Blue' if b > r + 30 else 'Grey' if lum < 200 else 'Light'
    for c in cs:
        w = ALPHA_WORDS[min(len(ALPHA_WORDS) - 1, int(c[3] * len(ALPHA_WORDS)))]
        TOK[c] = uniq(f'{bn} {w}')

def hexa(c): return '#%02X%02X%02X' % c[:3] if c[3] == 1 else f'rgba({c[0]}, {c[1]}, {c[2]}, {c[3]})'
TOKENS = [{'key': TOK[c], 'name': TOK[c], 'light': hexa(c)} for c in TOK]
def tokref(m):
    c = parse(m)
    if not c: return m
    if c[3] == 0: return 'rgba(0, 0, 0, 0)'
    return f'var(--$tok:{TOK[c]})' if c in TOK else m
def colorize(v):
    if not isinstance(v, str) or v.startswith('data:'): return v
    if re.fullmatch(r'\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{6,8})\s*', v): return tokref(v.strip())
    return COLOR_RE.sub(lambda m: tokref(m.group(0)), v)

# ---------- presets ----------
PFX = re.compile(r'^(civica-)?(pr|ct|bl|faq|sd|de|pe|po|depts|values|services|team|voice|about|hero|header|footer|note|ask)?-?')
EXPAND = {'pr': 'Pricing', 'ct': 'Contact', 'bl': 'Blog', 'pe': 'Person', 'po': 'Post', 'sd': 'Service', 'de': 'Department', 'depts': 'Departments',
          'rt': 'Route', 'rn': 'Route Name', 'br': 'Branch', 'k': 'Key', 'v': 'Value', 'n': 'Number', 'id': 'Code', 'cmp': 'Compare', 'faq': 'FAQ', 'cta': 'CTA'}
def role(cls):
    c = re.sub(r'^civica-', '', cls)
    c = '-'.join(EXPAND.get(w, w) for w in re.split(r'[-_]+', c))
    c = re.sub(r'^(w-|is-|text-block|div-block)', '', c)
    words = [w for w in re.split(r'[-_]+', c) if w and not w.isdigit()]
    return ' '.join(w if w.isupper() or ' ' in w or w[:1].isupper() else w.capitalize() for w in words) or 'Text'

GP = {}   # sig -> preset
pmaps = {}
def em(v):
    try: return float(str(v).replace('em', ''))
    except: return 0.0
LOOSE = {}  # loose sig -> list of (lh, ls, exact sig)
def canon(sp):
    sizes = [x['fontSize'] for x in sp['slots']]
    lk = json.dumps([sp['fontName'], sp['fontWeight'], sp.get('fontStyle', 'normal'), sp.get('textTransform', 'none'), sp.get('textDecoration', 'none'), sizes])
    lh, ls = em(sp['slots'][0]['lineHeight']), em(sp['slots'][0]['letterSpacing'])
    for (l2, s2, sig) in LOOSE.get(lk, []):
        if abs(l2 - lh) <= 0.08 and abs(s2 - ls) <= 0.02: return sig
    sig = json.dumps([lk, sp['slots']])
    LOOSE.setdefault(lk, []).append((lh, ls, sig))
    return sig
for page, b in bundles.items():
    pm = {}
    for sp in b.get('$presets', []):
        sig = canon(sp)
        g = GP.setdefault(sig, {'sig': sig, 'sp': sp, 'users': collections.Counter(), 'tags': collections.Counter()})
        for u in sp.get('users', []): g['users'][u] += 1
        g['tags'][sp.get('tag', 'p')] += 1
        pm[sp['key']] = sig
    pmaps[page] = pm
pnames = set()
PRESETS = []
WORDS = ['Large', 'Compact', 'Bold', 'Light', 'Wide', 'Small', 'Alt', 'Strong', 'Quiet', 'Tight']
for i, g in enumerate(sorted(GP.values(), key=lambda g: -sum(g['users'].values()))):
    sp = g['sp']
    us = [u for u, _ in g['users'].most_common() if u not in ('div', 'span', 'p', 'a', 'text', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'label')]
    n = role(us[0]) if us else ('Heading' if g['tags'].most_common(1)[0][0].startswith('h') else 'Body')
    n = n.replace(OLD, NEW)
    if n in pnames:
        for w in ([role(u) for u in us[1:3]] + WORDS):
            cand = n + ' ' + w if w in WORDS else w
            if cand not in pnames: n = cand; break
    pnames.add(n)
    s0 = sp['slots']
    px = lambda v: float(re.sub('[^0-9.]', '', v) or 0)
    attrs = {'tag': g['tags'].most_common(1)[0][0], 'fontName': sp['fontName'], 'fontWeight': sp['fontWeight'], 'fontStyle': sp.get('fontStyle', 'normal'),
             'textTransform': sp.get('textTransform', 'none'), 'lineHeight': s0[0]['lineHeight'], 'letterSpacing': s0[0]['letterSpacing'], 'fontSize': s0[0]['fontSize']}
    if sp.get('textDecoration', 'none') != 'none': attrs['textDecoration'] = sp['textDecoration']
    g['name'] = n
    PRESETS.append({'key': n, 'name': n, 'attrs': attrs, 'slots': s0})

# ---------- links / text ----------
def fix_text(t):
    if not isinstance(t, str): return t
    t = t.replace(OLD, NEW).replace(OLD.lower(), NEW.lower())
    t = re.sub(r'[\w.+-]+@[\w-]+\.[\w.]+', 'info@example.com', t)
    return t
def link(l):
    if not l or not l.get('href'): return l
    h = LIVE.sub('', l['href'])
    if h.startswith('mailto:'): return {**l, 'href': 'mailto:info@example.com'}
    if re.match(r'^(https?:|tel:)', h): return l
    if h.startswith('#') or h == '': return None
    seg = [s for s in h.split('#')[0].split('?')[0].strip('/').split('/') if s]
    if not seg: return {**l, 'href': '/'}
    if seg[0] in DROP: return None
    if len(seg) == 2 and seg[0] in DETAIL: return {**l, 'href': f'$detail:{DETAIL[seg[0]]}:{seg[1]}'}
    if seg[0] in PAGE_PATHS: return {**l, 'href': PAGE_PATHS[seg[0]]}
    return None

def fix(a, pm):
    a = dict(a)
    for k in ('fill', 'textColor', 'borderColor'):
        if k in a: a[k] = colorize(a[k])
    if a.get('overflowX') == 'auto' or a.get('overflowY') == 'auto':
        a.pop('overflowX', None); a.pop('overflowY', None); a['overflow'] = 'clip'; a['name'] = (a.get('name') or '') + ' [scroll-x]'
    tp = a.get('textStylePreset')
    if isinstance(tp, str) and tp.startswith('$preset:'): a['textStylePreset'] = '$preset:' + GP[pm[tp[8:]]]['name']
    if 'link' in a:
        l = link(a['link'])
        if l: a['link'] = l
        else: a.pop('link')
    for k in ('text', 'altText'):
        if k in a: a[k] = fix_text(a[k])
    if isinstance(a.get('name'), str): a['name'] = fix_text(a['name']).replace('civica-', 'tovia-')[:80]
    if isinstance(a.get('svg'), str): a['svg'] = a['svg']
    return a

summary = []
for page, b in bundles.items():
    secs = []
    for name, spec in b.items():
        if name.startswith('$'): continue
        ops = []
        dropped = set()
        for o in spec['ops']:
            if o['op'] == 'insert' and (o.get('parent') in dropped or re.search(r'w-backgroundvideo-backgroundvideoplaypause|w-webflow-badge', (o.get('attrs') or {}).get('name') or '')):
                dropped.add(o['key']); continue
            if o['op'] == 'replica' and o['key'] in dropped: continue
            o2 = {**o, 'attrs': fix(o.get('attrs') or {}, pmaps[page])}
            ops.append(o2)
        secs.append({'name': name.replace('Civica', 'Tovia'), 'ops': ops})
    out = {'widths': b['$widths'], 'sections': secs}
    raw = json.dumps(out).encode()
    json.dump(out, open(os.path.join(OUT, page + '.json'), 'w'))
    open(os.path.join(OUT, page + '.z.json'), 'w').write(json.dumps({'z': base64.b64encode(gzip.compress(raw)).decode()}))
    summary.append(f"{page}: {len(secs)} sections, {sum(len(s['ops']) for s in secs)} ops, {len(raw)//1024}KB")
json.dump({'tokens': TOKENS, 'presets': PRESETS}, open(os.path.join(OUT, 'ds.json'), 'w'), indent=1)
print('\n'.join(summary))
print('tokens', len(TOKENS), [t['name'] for t in TOKENS])
print('presets', len(PRESETS), [p['name'] for p in PRESETS])
