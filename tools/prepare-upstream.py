#!/usr/bin/env python3
"""Export only package sources into a LuCI checkout without modifying Git history."""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def prepare(directory):
    directory = pathlib.Path(directory).resolve()
    if not (directory / "luci.mk").is_file():
        raise ValueError("Expected a LuCI checkout containing luci.mk")
    target = directory / "applications/luci-app-device-manager"
    if target.exists():
        raise FileExistsError(f"Refusing to overwrite existing package: {target}")
    target.mkdir(parents=True)
    for name in ["htdocs", "root", "po"]:
        shutil.copytree(ROOT / name, target / name)
    for name in ["LICENSE"]:
        shutil.copyfile(ROOT / name, target / name)
    readme = (ROOT / "README.md").read_text()
    start = readme.index("## 构建和开发")
    end = readme.index("## 真实设备验收", start)
    readme = readme[:start] + (
        "## Development\n\n"
        "This application is built in the LuCI feed with the standard luci.mk.\n"
        "Independent SDK workflows, tests and deployment tools are maintained in\n"
        "[the source repository](https://github.com/xxi-arch/luci-app-device-manager).\n\n"
    ) + readme[end:]
    (target / "README.md").write_text(readme)
    # Package-specific attribution and usage documentation, excluding release tooling.
    shutil.copytree(ROOT / "docs", target / "docs",
                    ignore=shutil.ignore_patterns("upstream-submission.md", "validation.md"))
    makefile = (ROOT / "Makefile").read_text()
    start = makefile.index("# In-tree LuCI applications")
    end = makefile.index("# call BuildPackage", start)
    (target / "Makefile").write_text(makefile[:start] + "include ../../luci.mk\n\n" + makefile[end:])
    return target


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: prepare-upstream.py <luci-checkout>")
    print(prepare(sys.argv[1]))
