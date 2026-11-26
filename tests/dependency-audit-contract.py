import importlib.util, pathlib, json, base64, copy
p=pathlib.Path(__file__).with_name('dependency-audit.py');s=importlib.util.spec_from_file_location('audit',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
package=json.loads((p.parents[1]/'package.json').read_text());name,version=next(iter(package['dependencies'].items()))
entry={'version':version,'resolved':f'https://registry.npmjs.org/{name}/-/{name}-{version}.tgz','integrity':'sha512-'+base64.b64encode(bytes(64)).decode()}
lock={'lockfileVersion':3,'packages':{'':{k:package[k] for k in ['name','version','dependencies']},'node_modules/'+name:entry}}
assert m.validate_lock(package,lock)==1
for changes in [{'resolved':'file:///tmp/peer.tgz'},{'resolved':'https://private.example/peer.tgz'},{'integrity':'sha512-AAAA'},{'link':True},{'version':'0.0.1'}]:
 bad=copy.deepcopy(lock);bad['packages']['node_modules/'+name].update(changes)
 try:m.validate_lock(package,bad);raise AssertionError('Malformed dependency accepted')
 except ValueError:pass
print('PASS lock root and version, public registry, integrity and link policy (synthetic metadata only)')

# Mandatory dependencies cannot silently disappear from a reviewed lock.
bad=copy.deepcopy(lock);bad['packages']['node_modules/'+name]['dependencies']={'missing':'1.0.0'}
try:m.validate_lock(package,bad);raise AssertionError('Missing mandatory dependency accepted')
except ValueError:pass
bad['packages']['node_modules/'+name]['optionalDependencies']={'missing':'1.0.0'}
assert m.validate_lock(package,bad)==1
report={'auditReportVersion':2,'vulnerabilities':{},'metadata':{'vulnerabilities':{k:0 for k in ['info','low','moderate','high','critical','total']}}}
assert m.validate_report(report)['high']==0
for mutation in [{'high':-1},{'critical':False},{'total':1},{'high':1}]:
    bad=copy.deepcopy(report);bad['metadata']['vulnerabilities'].update(mutation)
    try:m.validate_report(bad);raise AssertionError('Malformed report accepted')
    except ValueError:pass
print('PASS mandatory dependency presence and vulnerability report consistency (synthetic fixtures)')
