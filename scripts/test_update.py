"""Self-contained updater tests: no network and no real skill directories are modified."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import update


def fixture_zip(base, version, extra=None):
    files={'SKILL.md':b'---\nname: dp-wm\n---\n', 'scripts/update.py':b'# fixture', 'scripts/generate.cjs':b'// fixture', 'scripts/order.cjs':b'// fixture', 'assets/template.html':version.encode()}
    files.update(extra or {})
    manifest={'name':'dp-wm','version':version,'files':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
    files['package-manifest.json']=json.dumps(manifest).encode()
    zpath=base/(version+'.zip')
    with zipfile.ZipFile(zpath,'w') as z:
        for k,v in files.items():z.writestr('dp-wm/'+k,v)
    return zpath


class Updates(unittest.TestCase):
    def test_install_replace_preserve_backup(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);target=base/'skills'/'dp-wm'
            first=fixture_zip(base,'1.0.0',{'stale.txt':b'old managed file'})
            self.assertEqual(update.install(first,target)['status'],'installed')
            (target/'my-order.txt').write_text('customer data',encoding='utf8')
            other=base/'orders';other.mkdir();(other/'image.png').write_bytes(b'keep')
            second=fixture_zip(base,'1.1.0')
            result=update.install(second,target)
            self.assertEqual(result['status'],'updated')
            self.assertFalse((target/'stale.txt').exists())
            self.assertEqual((target/'my-order.txt').read_text(),'customer data')
            self.assertEqual((other/'image.png').read_bytes(),b'keep')
            self.assertTrue(Path(result['backup']).is_file())
            with zipfile.ZipFile(result['backup']) as z:self.assertEqual(z.read('dp-wm/stale.txt'),b'old managed file')
            self.assertFalse(list(target.parent.glob('.dp-wm-*')))
            self.assertEqual(update.install(second,target)['status'],'up_to_date')

    def test_corruption_leaves_old(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);target=base/'skills'/'dp-wm'
            update.install(fixture_zip(base,'1.0.0'),target)
            bad=fixture_zip(base,'1.1.0')
            with zipfile.ZipFile(bad,'a') as z:z.writestr('dp-wm/extra.txt',b'unlisted')
            with self.assertRaises(ValueError):update.install(bad,target)
            self.assertEqual((target/'assets/template.html').read_text(),'1.0.0')

    def test_zip_slip_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);bad=base/'bad.zip'
            with zipfile.ZipFile(bad,'w') as z:z.writestr('dp-wm/../../outside.txt',b'no')
            with self.assertRaises(ValueError):update.install(bad,base/'skills'/'dp-wm')
            self.assertFalse((base/'outside.txt').exists())

    def test_version_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            with self.assertRaises(ValueError):update.install(fixture_zip(base,'1.0.0'),base/'dp-wm','1.1.0')

    def test_wrong_target_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            with self.assertRaises(ValueError):update.install(fixture_zip(base,'1.0.0'),base/'other-skill')

    def test_local_collision_not_destroyed(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);target=base/'dp-wm'
            update.install(fixture_zip(base,'1.0.0'),target)
            (target/'custom.txt').write_text('mine')
            with self.assertRaises(ValueError):update.install(fixture_zip(base,'1.1.0',{'custom.txt':b'upstream'}),target)
            self.assertEqual((target/'custom.txt').read_text(),'mine')


if __name__=='__main__':unittest.main()
