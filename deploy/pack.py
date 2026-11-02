"""打包 fitcheck 项目为 zip（正斜杠路径，兼容 Linux unzip）。"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fitcheck-upload.zip"

EXCLUDE_DIRS = {
    "__pycache__", ".venv", ".git", "node_modules",
}
EXCLUDE_FILES = {
    "server/.env", "server/secret.key", "server/fitcheck.db",
    "fitcheck-upload.zip",
}


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    for part in rel.parts:
        if part in EXCLUDE_DIRS:
            return False
    if rel.as_posix() in EXCLUDE_FILES:
        return False
    name = path.name
    if name.startswith("fitcheck.db") or name.startswith("secret.key"):
        return False
    return True


def main():
    if OUT.exists():
        OUT.unlink()
    entries = []
    for base in ("server", "web", "docs", "deploy"):
        p = ROOT / base
        if p.is_dir():
            entries.extend(f for f in p.rglob("*") if f.is_file())
        elif p.is_file():
            entries.append(p)
    readme = ROOT / "README.md"
    if readme.exists():
        entries.append(readme)

    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in entries:
            if not include(f):
                continue
            zf.write(f, f.relative_to(ROOT).as_posix())
            count += 1
    print(f"打包完成: {OUT} ({count} 个文件, {OUT.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
