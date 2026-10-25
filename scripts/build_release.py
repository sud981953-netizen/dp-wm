"""Build the distributable release; intentionally excludes customer orders and local Git data."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = '1.1.0'
TOP = ['SKILL.md','README.md','LICENSE','THIRD_PARTY_NOTICES.md','agents','assets','references','scripts','vendor']


def build(destination=None):
    files = []
    for item in TOP:
        p = ROOT / item
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            files += [f for f in p.rglob('*') if f.is_file() and '__pycache__' not in f.parts and f.suffix not in ('.pyc','.pyo')]
    digests = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    manifest = ROOT / 'package-manifest.json'
    manifest.write_text(json.dumps({'name':'dp-wm','version':VERSION,'repository':'https://github.com/sud981953-netizen/dp-wm','files':digests}, ensure_ascii=False, indent=2), encoding='utf-8')
    output = destination or ROOT.parent / 'release'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'dp-wm.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files + [manifest]:
            z.write(p, 'dp-wm/' + p.relative_to(ROOT).as_posix())
    (output / 'dp-wm.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  dp-wm.zip\n', encoding='ascii')
    print(json.dumps({'version':VERSION,'archive':str(archive),'files':len(files)+1}))
    return archive


if __name__ == '__main__':
    build()
