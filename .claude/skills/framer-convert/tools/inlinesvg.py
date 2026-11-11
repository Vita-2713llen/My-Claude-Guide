# Inline simple class-based <style> rules into style="" attributes (rule order = cascade), drop <style> and class attrs
import re, sys
s = open(sys.argv[1]).read()
st = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
rules = []
for sel, body in re.findall(r'([^{}]+)\{([^}]*)\}', st):
    for one in sel.split(','):
        classes = re.findall(r'\.([\w-]+)', one.strip())
        if classes: rules.append((set(classes), body.strip().rstrip(';')))
def repl(m):
    tag = m.group(0)
    cm = re.search(r'\sclass="([^"]*)"', tag)
    if not cm: return tag
    cls = set(cm.group(1).split())
    decl = ';'.join(b for c, b in rules if c <= cls)
    tag = tag.replace(cm.group(0), '')
    if not decl: return tag
    sm = re.search(r'\sstyle="([^"]*)"', tag)
    if sm: return tag.replace(sm.group(0), ' style="%s;%s"' % (decl, sm.group(1)))
    return re.sub(r'^<([\w:-]+)', lambda x: '<%s style="%s"' % (x.group(1), decl), tag)
s = re.sub(r'<style>.*?</style>', '', s, flags=re.S)
s = re.sub(r'<(?!/)[\w:-]+[^>]*>', repl, s)
open(sys.argv[2], 'w').write(s)
print(len(s), s.count('class='))
