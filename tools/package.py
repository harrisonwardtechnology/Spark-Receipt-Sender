#!/usr/bin/env python3
"""Build the zip to upload to the Chrome Web Store.

    python3 tools/package.py           # writes dist/receipt-sender-<version>.zip
    python3 tools/package.py --list    # prints the files that would go in, as JSON

Only what the extension needs to run goes in: manifest.json, the scripts, the
pages, the shared stylesheet, and the icons. Tests, tools, docs, store assets,
package.json and .github stay out.

The file list isn't typed in by hand. It starts from manifest.json and follows
every script, stylesheet, image and page those files point to, so a new file
is picked up as soon as something uses it.

The build stops with an error if:
  - a file the manifest (or a page) points to is missing
  - the version in manifest.json, package.json and CHANGELOG.md don't match
  - anything that isn't a runtime file would end up in the zip

Needs only Python 3. Nothing is installed or downloaded.
"""

import argparse
import json
import pathlib
import posixpath
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# Runtime files are only ever these kinds, and only from these places.
RUNTIME_ENDINGS = {".js", ".html", ".css", ".png", ".json"}
NEVER = ("test/", "tools/", "docs/", "store/", "dist/", ".github/", "node_modules/")
NEVER_NAMES = {"package.json", "package-lock.json", "README.md", "CHANGELOG.md", "PRIVACY.md",
               "LICENSE", ".gitignore", "chrome_stub.js"}


class PackageError(Exception):
    pass


def manifest():
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


def manifest_files(m):
    """Every file manifest.json names."""
    files = [m["background"]["service_worker"], m["action"]["default_popup"], m["options_page"]]
    for cs in m.get("content_scripts", []):
        files += cs.get("js", []) + cs.get("css", [])
    files += list(m.get("icons", {}).values())
    files += list(m["action"].get("default_icon", {}).values())
    return files


def local_refs(name, text):
    """Files a page or script points to inside the extension."""
    refs = []
    if name.endswith(".html"):
        for attr in ("src", "href"):
            refs += re.findall(r"<(?:script|link|img|source|a)\b[^>]*\b%s=\"([^\"]+)\"" % attr, text)
    elif name.endswith(".js"):
        refs += re.findall(r"importScripts\(\s*\"([^\"]+)\"", text)
    elif name.endswith(".css"):
        refs += re.findall(r"url\(\s*['\"]?([^'\")]+)", text)
    keep = []
    for ref in refs:
        ref = ref.split("#")[0].split("?")[0]
        if not ref or re.match(r"^[a-z][a-z0-9+.-]*:|^//", ref, re.I):
            continue  # a web address or an in-page link, not a file
        ref = posixpath.normpath(ref)
        if ref.startswith(".."):
            raise PackageError("%s points outside the extension: %s" % (name, ref))
        keep.append(ref)
    return keep


def runtime_files():
    """Follow the manifest out to every file the extension loads."""
    m = manifest()
    todo = ["manifest.json"] + manifest_files(m)
    seen, missing = [], []
    while todo:
        name = todo.pop(0)
        if name in seen or name in missing:
            continue
        path = ROOT / name
        if not path.is_file():
            missing.append(name)
            continue
        seen.append(name)
        if path.suffix in (".html", ".js", ".css"):
            todo += local_refs(name, path.read_text(encoding="utf-8"))
    if missing:
        raise PackageError("Missing files the extension points to: " + ", ".join(sorted(missing)))
    return sorted(seen)


def check_files(files):
    bad = []
    for name in files:
        if (name.startswith(NEVER) or pathlib.PurePosixPath(name).name in NEVER_NAMES
                or pathlib.PurePosixPath(name).suffix not in RUNTIME_ENDINGS
                or name.startswith(".") or "/." in name or "__" in name):
            bad.append(name)
        elif name.endswith(".json") and name != "manifest.json":
            bad.append(name)
        elif name.endswith(".png") and not name.startswith("icons/"):
            bad.append(name)
    if bad:
        raise PackageError("These aren't runtime files and must not be in the zip: " + ", ".join(bad))


def check_version():
    version = manifest()["version"]
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    top = re.search(r"^## ([0-9.]+),", (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)
    if pkg != version:
        raise PackageError("manifest.json says %s but package.json says %s" % (version, pkg))
    if not top or top.group(1) != version:
        raise PackageError("manifest.json says %s but CHANGELOG.md starts with %s"
                           % (version, top.group(1) if top else "nothing"))
    return version


def build():
    version = check_version()
    files = runtime_files()
    check_files(files)
    DIST.mkdir(exist_ok=True)
    out = DIST / ("receipt-sender-%s.zip" % version)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in files:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))  # same bytes on every build
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, (ROOT / name).read_bytes())
    # Read it back: the zip must hold exactly the runtime files
    with zipfile.ZipFile(out) as z:
        inside = sorted(z.namelist())
        if z.testzip() is not None:
            raise PackageError("The zip didn't read back cleanly")
    if inside != files:
        raise PackageError("The zip holds %s, expected %s" % (inside, files))
    check_files(inside)
    return out, files


def main():
    parser = argparse.ArgumentParser(description="Build the Chrome Web Store zip.")
    parser.add_argument("--list", action="store_true", help="print the runtime files as JSON and stop")
    args = parser.parse_args()
    try:
        if args.list:
            files = runtime_files()
            check_files(files)
            print(json.dumps(files))
            return 0
        out, files = build()
    except PackageError as e:
        print("Can't build the zip. " + str(e))
        return 1
    size = out.stat().st_size / 1024
    print("Built %s (%d files, %.0f KB):" % (out.relative_to(ROOT), len(files), size))
    for name in files:
        print("  " + name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
