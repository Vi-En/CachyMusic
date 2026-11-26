"""Shared source-kit qualification policy. Run only against a clean staging tree.
Not a comprehensive secret scanner or a deployed-runtime inventory.
"""
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

ROOT_FILES = frozenset('''.gitignore ANDROID-APK-BUILD.md BETA-ACCEPTANCE.md COMPATIBILITY.md INITIAL-TEST.md LICENSE README.md THIRD-PARTY-NOTICES.md index.html index.php install.sh manifest.json package.json schema.sql sw.js uninstall.sh'''.split())
OPTIONAL_ROOT = frozenset({'package-lock.json'})
SOURCE_DIRS = frozenset({'bin','docs','packaging','php','resources','scripts','server','stylesheets','tests','tools','.github'})
LEGACY_REQUIRED = ROOT_FILES | {'scripts/dsp-worklet-processor.js','tools/release-verify.py','tests/run-all.sh','bin/desktop-launcher.py','tools/packager/android/app/build.gradle','tools/packager/android/app/src/main/AndroidManifest.xml'}
REQUIRED = LEGACY_REQUIRED | {'php/scan_worker.php','php/scan_jobs.php','php/api/scan_jobs.php','scripts/modules/server-scan.js','php/scan_resume.php','php/cover_cache_budget.php','php/media_access.php','php/metadata_edit.php','php/cover_jobs.php','php/cover_extract.php','php/recording_lock.php','bin/cachymusic-process.py','php/folder_picker.php','scripts/modules/library-transition.js','php/recording_leases.php','php/api/recording_lease.php','scripts/modules/recording-lease.js','php/profile_budget.php','tests/profile-admission.py','php/cover_index_portable.php','tests/portable-lookup.py'}
DENIED_PARTS = frozenset({'.git','.agents','.gradle','.idea','.vscode','__pycache__','node_modules','dist','build','data','cache','downloads','runtime','electron-dist','notices','agents.md','claude.md','gemini.md','instructions.md','changelog.md','local.properties','soulseek-config.json','soulseek-transfers.json','.ds_store','thumbs.db'})
DENIED_SUFFIXES = frozenset({'.pyc','.pyo','.log','.heapsnapshot','.heapprofile','.pem','.p12','.jks','.keystore','.apk','.aab','.exe','.so','.dll','.db','.sqlite','.sqlite3','.ttf','.otf','.woff','.woff2','.zip','.tar','.gz','.key','.crt','.cert','.pid','.port','.swp','.swo'})
GENERATED_DIRS = frozenset({'.git','tools/packager/android/.gradle','tools/packager/android/build','tools/packager/android/app/build','tools/packager/android/app/src/main/assets'})

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()

def validate_rel(name):
    p=PurePosixPath(name)
    require(bool(p.parts) and not p.is_absolute() and p.as_posix()==name and '\\' not in name and not any(x in {'.','..'} for x in p.parts), 'Noncanonical source path: '+name)
    # Reject Windows aliases and case-collision hazards in the cross-platform kit.
    for part in p.parts:
        lower=part.lower()
        require(not any(c in part for c in ':<>|?*"') and not any(ord(c)<32 for c in part) and not part.endswith(('.', ' ')) and not re.fullmatch(r'(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?',lower), 'Unsafe cross-platform path: '+name)
        require(lower not in DENIED_PARTS and not lower.startswith(('.env','id_rsa','id_ed25519')) and not (lower.startswith('.') and lower not in {'.github','.gitignore'}), 'Excluded source path: '+name)
    require(p.suffix.lower() not in DENIED_SUFFIXES,'Excluded source file: '+name)
    require((len(p.parts)==1 and name in ROOT_FILES|OPTIONAL_ROOT) or (len(p.parts)>1 and p.parts[0] in SOURCE_DIRS), 'Unexpected source path: '+name)
    return p

def register_case(name, aliases):
    for part in [PurePosixPath(name), *PurePosixPath(name).parents]:
        value=part.as_posix();key=value.casefold()
        require(key not in aliases or aliases[key]==value,'Case-colliding source path: '+name)
        aliases[key]=value

def source_files(root):
    require(root.is_dir() and not root.is_symlink(),'Source root must be a real directory')
    files={}; aliases={}
    for current,dirs,names in os.walk(root,followlinks=False):
        for name in dirs[:]:
            path=Path(current)/name; rel=path.relative_to(root).as_posix()
            require(not path.is_symlink(),'Aliased source directory: '+rel)
            if rel in GENERATED_DIRS or name=='__pycache__':dirs.remove(name);continue
            # Even empty unexpected directories should not be staged.
            require(rel.split('/')[0] in SOURCE_DIRS,'Unexpected staging directory: '+rel)
            require(not any(p.lower() in DENIED_PARTS or p.lower().startswith('.env') for p in PurePosixPath(rel).parts),'Excluded staging directory: '+rel)
        for name in names:
            path=Path(current)/name;rel=path.relative_to(root).as_posix()
            validate_rel(rel)
            info=path.lstat()
            require(stat.S_ISREG(info.st_mode) and info.st_nlink==1,'Nonregular or hard-linked source file: '+rel)
            register_case(rel,aliases);files[rel]=path
    require(REQUIRED<=files.keys(),'Missing required source files: '+', '.join(sorted(REQUIRED-files.keys())))
    return files

def zip_files(z, prefix, required=REQUIRED):
    """Return exact canonical regular-file entries, rejecting aliased names.
    ZIP directory entries are optional and must be canonical if present.
    """
    files={}; seen=set(); folded=set(); aliases={}; root_seen=False
    for item in z.infolist():
        raw=item.orig_filename
        require(raw==item.filename and '\x00' not in raw,'Truncated ZIP name')
        require(raw.startswith(prefix+'/'),'Wrong source archive root: '+raw)
        name=raw[len(prefix)+1:]
        if item.is_dir():
            name=name[:-1]
            if not name:
                require(not root_seen and stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFDIR),'Invalid duplicate archive root');root_seen=True;continue
            validate_rel(name+'/placeholder')
            require(name not in seen and name.casefold() not in folded,'Duplicate archive entry: '+name)
            require(stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFDIR),'Non-directory archive entry: '+name)
        else:
            validate_rel(name)
            require(name not in seen and name.casefold() not in folded,'Duplicate archive entry: '+name)
            require(stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFREG),'Nonregular archive entry: '+name)
            require(not item.flag_bits&1,'Encrypted archive entry: '+name)
            files[name]=item
        register_case(name,aliases);seen.add(name);folded.add(name.casefold())
    for name in seen:
        require(not any(parent.as_posix() in files for parent in PurePosixPath(name).parents),'Archive file/directory conflict: '+name)
    require(required<=files.keys(),'Missing required archive files: '+', '.join(sorted(required-files.keys())))
    require(z.testzip() is None,'Archive CRC failure')
    return files

def fingerprint(root):
    h=hashlib.sha256()
    for name,path in sorted(source_files(root).items()):
        h.update(name.encode()+b'\0'+bytes.fromhex(sha256(path)))
    return h.hexdigest()
