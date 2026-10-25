#!/usr/bin/env python3
"""Install/update the official dp-wm release. Uses Python standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone

REPOSITORY = 'sud981953-netizen/dp-wm'
MAX_BYTES = 150 * 1024 * 1024
MAX_EXPANDED = 350 * 1024 * 1024


def request(url, limit=MAX_BYTES):
    req = urllib.request.Request(url, headers={'User-Agent': 'dp-wm-updater/1.1.0', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('下载内容超过预期大小，停止安装。')
    return data


def official_release():
    info = json.loads(request(f'https://api.github.com/repos/{REPOSITORY}/releases/latest', 2 * 1024 * 1024))
    tag = info.get('tag_name', '')
    if not re.fullmatch(r'v\d+\.\d+\.\d+', tag) or info.get('draft') or info.get('prerelease'):
        raise ValueError('最新 Release 不是有效的正式版本。')
    expected = f'https://github.com/{REPOSITORY}/releases/download/{tag}/'
    assets = {a['name']: a['browser_download_url'] for a in info.get('assets', [])}
    for name in ('dp-wm.zip', 'dp-wm.zip.sha256'):
        if assets.get(name) != expected + name:
            raise ValueError('正式发布包或校验文件缺失，停止更新。')
    checksum = request(assets['dp-wm.zip.sha256'], 4096).decode('ascii').strip()
    match = re.fullmatch(r'([0-9a-f]{64})\s+\*?dp-wm\.zip', checksum)
    if not match:
        raise ValueError('校验文件格式错误。')
    data = request(assets['dp-wm.zip'])
    if hashlib.sha256(data).hexdigest() != match[1]:
        raise ValueError('下载包 SHA-256 不匹配，旧技能未改动。')
    return data, tag[1:]


def safe_relative(name):
    if '\\' in name or '\x00' in name:
        raise ValueError('压缩包路径不安全。')
    p = PurePosixPath(name)
    if p.is_absolute() or not p.parts or any(x in ('..', '.') for x in p.parts):
        raise ValueError('压缩包包含越界路径。')
    reserved = {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}
    for component in p.parts:
        if ':' in component or component.endswith((' ', '.')) or component.split('.')[0].upper() in reserved:
            raise ValueError('压缩包路径不适用于安全安装。')
    return p


def unpack_verified(archive, destination, expected_version=None):
    with zipfile.ZipFile(archive) as z:
        files = z.infolist()
        if len(files) > 6000 or sum(i.file_size for i in files) > MAX_EXPANDED:
            raise ValueError('压缩包展开大小异常。')
        seen = set()
        for item in files:
            p = safe_relative(item.filename.rstrip('/'))
            if p.parts[0] != 'dp-wm' or len(p.parts) < 2:
                if item.is_dir() and p.parts == ('dp-wm',):
                    continue
                raise ValueError('发布包必须位于 dp-wm/ 目录内。')
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('发布包不允许符号链接。')
            name = '/'.join(p.parts[1:])
            if name.casefold() in seen:
                raise ValueError('发布包存在重复或大小写冲突路径。')
            seen.add(name.casefold())
            target = destination.joinpath(*p.parts[1:])
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(item) as src, target.open('wb') as dst:
                    shutil.copyfileobj(src, dst)
    manifest = json.loads((destination / 'package-manifest.json').read_text(encoding='utf-8'))
    if manifest.get('name') != 'dp-wm' or not re.fullmatch(r'\d+\.\d+\.\d+', manifest.get('version', '')):
        raise ValueError('技能身份或版本无效。')
    if expected_version and manifest['version'] != expected_version:
        raise ValueError('发布标签与包内版本不一致。')
    expected = manifest.get('files', {})
    if not isinstance(expected, dict) or not expected:
        raise ValueError('发布清单缺失。')
    actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()}
    if actual != set(expected) | {'package-manifest.json'}:
        raise ValueError('发布包文件与清单不一致。')
    for name, digest in expected.items():
        rel = safe_relative(name)
        if hashlib.sha256(destination.joinpath(*rel.parts).read_bytes()).hexdigest() != digest:
            raise ValueError('包内文件校验失败：' + name)
    for name in ('SKILL.md','scripts/update.py','scripts/generate.cjs','scripts/order.cjs','assets/template.html'):
        if name not in expected:
            raise ValueError('必需技能文件缺失：' + name)
    return manifest


def existing_files(target):
    # Never follow user symlinks/junctions when making a replacement tree or backup.
    for parent, dirs, files in os.walk(target, followlinks=False):
        for name in dirs + files:
            p = Path(parent) / name
            attrs = getattr(p.lstat(), 'st_file_attributes', 0)
            if p.is_symlink() or attrs & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400):
                raise ValueError('技能目录含符号链接或目录联接，请先检查：' + str(p))
        for name in files:
            yield Path(parent) / name


def install(archive, target, expected_version=None):
    original = Path(target).expanduser().absolute()
    if original.is_symlink() or original.resolve() != original:
        raise ValueError('安装目录不能是链接或含未解析路径。')
    target = original.resolve()
    if target.name != 'dp-wm':
        raise ValueError('安装目标必须是名为 dp-wm 的专用技能目录。')
    if (target / '.git').exists():
        raise ValueError('这是 Git 开发仓库，请通过 Git 管理源码；自动更新只替换安装目录。')
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.dp-wm-stage-', dir=target.parent))
    previous = target.parent / ('.dp-wm-previous-' + uuid.uuid4().hex)
    backup = None
    swapped = False
    try:
        manifest = unpack_verified(archive, staging, expected_version)
        old = None
        if target.exists():
            old_path = target / 'package-manifest.json'
            if not old_path.is_file() or not (target / 'SKILL.md').is_file():
                raise ValueError('目标不是可识别的 dp-wm 安装，停止覆盖。')
            old = json.loads(old_path.read_text(encoding='utf-8'))
            if old.get('name') != 'dp-wm':
                raise ValueError('目标技能身份不符。')
            old_files = list(existing_files(target))
            if old.get('version') == manifest['version'] and old.get('files') == manifest['files']:
                clean = all((target / k).is_file() and hashlib.sha256((target / k).read_bytes()).hexdigest() == v for k,v in manifest['files'].items())
                if clean:
                    return {'ok': True, 'status':'up_to_date', 'version':manifest['version'], 'target':str(target)}
            # Preserve user-added files, including misplaced orders. Remove obsolete *managed* files only.
            managed = set(old.get('files', {})) | {'package-manifest.json'}
            for file in old_files:
                rel = file.relative_to(target)
                if '__pycache__' in rel.parts or file.suffix in ('.pyc', '.pyo'):
                    continue
                if rel.as_posix() not in managed:
                    destination = staging / rel
                    if destination.exists():
                        raise ValueError('新版本与用户自建文件冲突：' + str(rel))
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file, destination)
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
            backup_dir = target.parent.parent / 'skill-backups' / 'dp-wm'
            backup_dir.mkdir(parents=True, exist_ok=True)
            backup = backup_dir / (stamp + '.zip')
            with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as z:
                for file in old_files:
                    z.write(file, 'dp-wm/' + file.relative_to(target).as_posix())
            with zipfile.ZipFile(backup) as z:
                if z.testzip() is not None:
                    raise ValueError('旧版本备份校验失败。')
            target.rename(previous)
        try:
            staging.rename(target)
            swapped = True
        except BaseException:
            if previous.exists():
                previous.rename(target)
            raise
        # This is the exact old skill directory moved by this function, not an inferred recursive target.
        if previous.exists():
            if previous.parent != target.parent or not previous.name.startswith('.dp-wm-previous-'):
                raise ValueError('旧版本清理边界异常。')
            shutil.rmtree(previous)
        return {'ok':True, 'status':'updated' if old else 'installed','version':manifest['version'],'target':str(target),'backup':str(backup) if backup else None}
    finally:
        if not swapped and staging.exists():
            if staging.parent != target.parent or not staging.name.startswith('.dp-wm-stage-'):
                raise ValueError('临时目录边界异常。')
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description='DP-WM-update：安装/更新 GitHub 官方最新正式版。')
    parser.add_argument('--target', default=str(Path(__file__).resolve().parent.parent), help='专用 dp-wm 技能安装目录')
    parser.add_argument('--archive', help='用户明确指定的本地发布包（离线安装/测试）；默认从官方 GitHub 下载')
    args = parser.parse_args()
    if args.archive:
        result = install(Path(args.archive).resolve(), args.target)
    else:
        data, version = official_release()
        with tempfile.TemporaryDirectory(prefix='dp-wm-download-') as tmp:
            archive = Path(tmp) / 'dp-wm.zip'
            archive.write_bytes(data)
            result = install(archive, args.target, version)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok':False,'error':str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
