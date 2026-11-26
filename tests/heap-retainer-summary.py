"""Aggregate synthetic Chromium heap snapshots. Raw snapshots may contain private data;
keep them local. Node self sizes are shallow, not dominator-retained sizes.
Compare object IDs only within the same renderer isolate and capture sequence.
"""
import argparse, collections, json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('snapshots',nargs='+',type=Path);args=p.parse_args()

def inspect(path):
    with path.open() as f:d=json.load(f)
    meta=d['snapshot']['meta'];nf=meta['node_fields'];ef=meta['edge_fields'];ns=len(nf);es=len(ef)
    types=meta['node_types'][nf.index('type')];edge_types=meta['edge_types'][ef.index('type')];strings=d['strings'];nodes=d['nodes'];edges=d['edges'];objects={};totals=collections.defaultdict(lambda:[0,0]);groups=[]
    for at in range(0,len(nodes),ns):
        kind=types[nodes[at+nf.index('type')]];name=strings[nodes[at+nf.index('name')]]
        # Avoid emitting arbitrary string contents or script/source text in reports.
        if kind in ('string','concatenated string','sliced string','code','object shape'):name='(grouped)'
        group=(kind,name);size=nodes[at+nf.index('self_size')];oid=nodes[at+nf.index('id')];groups.append(group);objects[oid]=(group,size);totals[group][0]+=1;totals[group][1]+=size
    return d,objects,totals,groups

def compare(old,new):
    d,objects,totals,groups=new;_,prior,old_totals,_=old
    changes=[]
    for group,(count,size) in totals.items():
        old_count,old_size=old_totals.get(group,(0,0));delta=size-old_size
        if delta>0:changes.append({'type':group[0],'name':group[1],'deltaBytes':delta,'deltaCount':count-old_count})
    changes.sort(key=lambda x:x['deltaBytes'],reverse=True)
    fresh=set(objects)-set(prior);fresh_totals=collections.defaultdict(lambda:[0,0]);
    for oid in fresh:
        group,size=objects[oid];fresh_totals[group][0]+=1;fresh_totals[group][1]+=size
    top={g for g,v in sorted(fresh_totals.items(),key=lambda item:item[1][1],reverse=True)[:12]}
    meta=d['snapshot']['meta'];nf=meta['node_fields'];ef=meta['edge_fields'];ns=len(nf);es=len(ef);nodes=d['nodes'];edges=d['edges'];strings=d['strings'];edge_types=meta['edge_types'][ef.index('type')];incoming=collections.Counter();history=[];sessions=[];offsets=[];at_edge=0
    id_offset=nf.index('id');count_offset=nf.index('edge_count');type_offset=ef.index('type');target_offset=ef.index('to_node');name_offset=ef.index('name_or_index')
    for i,source in enumerate(groups):
        offsets.append(at_edge)
        for e in range(at_edge,at_edge+nodes[i*ns+count_offset]*es,es):
            kind=edge_types[edges[e+type_offset]];dest=edges[e+target_offset];target=groups[dest//ns];oid=nodes[dest+id_offset]
            label=strings[edges[e+name_offset]] if kind not in ('element','hidden') else '(indexed)'
            if kind=='property' and label=='playlistPlayback' and target[0]=='object':sessions.append(dest)
            if kind=='property' and label=='history' and source[0]=='object' and target==('object','Array'):
                # The array's outgoing edges include numeric entries, internal metadata and its backing store.
                history.append({'owner':source[1],'arrayEdges':nodes[dest+count_offset]})
            if kind!='weak' and oid in fresh and target in top:
                incoming[(source[0],source[1],kind,label if label in ('history','track','cursor','elements','table','context','value','map','code','feedback_cell','shared','prototype') else '(other)',target[0],target[1])]+=1
        at_edge+=nodes[i*ns+count_offset]*es
    def children(at):
        start=offsets[at//ns]
        for e in range(start,start+nodes[at+count_offset]*es,es):
            kind=edge_types[edges[e+type_offset]]
            label=strings[edges[e+name_offset]] if kind not in ('element','hidden') else '(indexed)'
            yield kind,label,edges[e+target_offset]
    session_histories=[]
    for at in set(sessions):
        for kind,label,array in children(at):
            if kind!='property' or label!='history' or groups[array//ns]!=('object','Array'):continue
            entries={dest for typ,_,dest in children(array) if typ=='element'}
            backing={dest for typ,label,dest in children(array) if typ=='internal' and label=='elements'}
            size_offset=nf.index('self_size')
            session_histories.append({'entryCount':len(entries),'entryShallowBytes':sum(nodes[i+size_offset] for i in entries),'arrayShallowBytes':nodes[array+size_offset],'backingShallowBytes':sum(nodes[i+size_offset] for i in backing)})
    return {'nodeCountBefore':len(prior),'nodeCountAfter':len(objects),'totalShallowDeltaBytes':sum(v[1] for v in objects.values())-sum(v[1] for v in prior.values()),'positiveShallowGroups':changes[:20],'newObjectIncomingStrongEdgeGroups':[{'source':list(k[:2]),'edge':k[2],'label':k[3],'target':list(k[4:]),'count':n} for k,n in incoming.most_common(30)],'historyArrayCandidates':history,'playlistSessionHistory':session_histories,'limitations':'Direct incoming strong edges are reference evidence, not dominator paths or proof of leak ownership. Object IDs compared in the same isolate only.'}

previous=inspect(args.snapshots[0]);out=[]
for path in args.snapshots[1:]:
    current=inspect(path);out.append({'checkpoint':path.name,**compare(previous,current)});previous=current
print(json.dumps(out,indent=2))
