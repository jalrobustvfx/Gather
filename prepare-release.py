"""Build an allowlisted Gather release without personal collections or local media."""
from pathlib import Path
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
DEST = ROOT / 'dist' / 'Gather-v0.1'
ARCHIVE = ROOT / 'dist' / 'Gather-v0.1.zip'


def prepare():
    build_source = (ROOT / 'build-extension.ps1').read_text(encoding='utf-8')
    file_block = build_source.split('$extensionFiles = @(', 1)[1].split(')', 1)[0]
    extension_files = re.findall(r"'([^']+)'", file_block)
    files = [Path(name) for name in extension_files]
    files += [Path(name) for name in [
        'server.py', 'backup_service.py', 'watch_service.py', 'build-extension.ps1',
        'prepare-release.py', 'README.md', '.gitignore',
    ]]
    files += [Path('extension') / name for name in extension_files]
    files += [p.relative_to(ROOT) for p in (ROOT / 'docs').rglob('*')
              if p.is_file() and p.suffix.lower() in {'.md', '.jpg', '.png'}]
    files += [p.relative_to(ROOT) for p in (ROOT / 'tests').iterdir()
              if p.is_file() and (p.name.endswith('.test.cjs')
                  or (p.name.startswith('test_') and p.suffix == '.py')
                  or p.name.endswith('-fixture.html') or p.name.endswith('-fixture.js'))]
    files = sorted(set(files))
    for relative in files:
        if not (ROOT / relative).is_file():
            raise FileNotFoundError(f'Required release file missing: {relative}')
    DEST.mkdir(parents=True, exist_ok=True)
    # Refuse unexpected files from an earlier run instead of deleting anything.
    allowed = set(files)
    unexpected = [p.relative_to(DEST) for p in DEST.rglob('*')
                  if p.is_file() and p.relative_to(DEST) not in allowed]
    if unexpected:
        raise RuntimeError(f'Unexpected files in release directory: {unexpected}')
    for relative in files:
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
    with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for relative in files:
            bundle.write(DEST / relative, (Path('Gather-v0.1') / relative).as_posix())
    print(f'Prepared {len(files)} files: {ARCHIVE}')
    print(f'Upload-ready source directory: {DEST}')


if __name__ == '__main__':
    prepare()
