from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
ROOT=Path(__file__).resolve().parent.parent
class DomChecker(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.details=[];self.current=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.append(d['id'])
        if tag == 'details':self.details.append(d)
checker=DomChecker();checker.feed((ROOT/'index.html').read_text())
counts=Counter(checker.ids)
assert not [id for id,num in counts.items() if num>1],f'Duplicate IDs: {[id for id,num in counts.items() if num>1]}'
assert {'settingsAdvancedAudio','settingsSearchInput','slskSearchInput','slskSearchSubmitBtn','settingsCategoryNav'}<=set(checker.ids)
assert any('settingsAdvancedDetails' in x.get('class','') for x in checker.details)
sw=(ROOT/'sw.js').read_text()
for asset in ('audit-overhaul.css','pwa-install.js','soulseek-ui-budget.js'):
    assert asset in sw,f'Service worker omitted {asset}'
p2p=(ROOT/'scripts/modules/p2p.js').read_text()
app=(ROOT/'scripts/modules/app.js').read_text()
assert 'items.slice(start, visible)' in p2p
assert 'slskResultsList.replaceChildren(resultFragment)' in p2p
assert "const setupPwaInstallPrompt = () => import('./pwa-install.js')" in app
assert 'setupDownloadWorkspace' not in app and 'fetchLanStreamingUrl' not in p2p
assert 'downloadWorkspace' not in checker.ids
assert 'compactMediaBtn' not in checker.ids and 'compactMediaDialog' not in checker.ids
print('PASS unique HTML IDs, native disclosure, cached assets and deferred network UI')

# Player presentation and retired tonearm invariants.
for asset in ('index.html','stylesheets/components.css','stylesheets/refined.css','stylesheets/theme-identities.css','scripts/modules/ui-elements.js','scripts/modules/player-core.js'):
    assert not any(token in (ROOT/asset).read_text() for token in ('toneArm','armPivot','armShaft','armCartridge')),asset
assert "if (viewName === 'download' && !downloadWorkspace) viewName = 'settings';" in (ROOT/'scripts/modules/ui-elements.js').read_text()
print('PASS retired tonearm and legacy download route')
