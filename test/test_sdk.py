"""Offline checks for SDK selection and the actual translation catalogue."""
import importlib.util
import io
import json
import pathlib
import re
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("resolve_sdk", ROOT / "tools/resolve-sdk.py")
SDK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SDK)


class SDKTests(unittest.TestCase):
    def test_requested_version_and_target_select_the_corresponding_sdk(self):
        for version, target in [("24.10.0", "x86/64"), ("23.05.5", "mediatek/filogic")]:
            filename = f"openwrt-sdk-{version}-test_gcc.Linux-x86_64.tar.zst"
            checksum = "a" * 64
            listing = f'<a href="{filename}">{filename}</a><a href="../">Parent</a>'
            with patch.object(SDK, "urlopen", side_effect=[io.BytesIO(listing.encode()), io.BytesIO(f"{checksum} *{filename}\n".encode())]) as fetch:
                url, sha = SDK.resolve(version, target)
                self.assertEqual(url, f"https://downloads.openwrt.org/releases/{version}/targets/{target}/{filename}")
                self.assertEqual(sha, checksum)
                self.assertEqual(fetch.call_args_list[0].args[0], f"https://downloads.openwrt.org/releases/{version}/targets/{target}/")

    def test_invalid_inputs_fail_before_any_network_request(self):
        for version, target in [("$(id)", "x86/64"), ("24.10.0", "../x86"), ("24.10.0", "x86/64\nextra")]:
            with patch.object(SDK, "urlopen") as fetch:
                with self.assertRaises(ValueError):
                    SDK.resolve(version, target)
                fetch.assert_not_called()

    def test_missing_sdk_or_checksum_is_rejected(self):
        with patch.object(SDK, "urlopen", return_value=io.BytesIO(b"<html></html>")):
            with self.assertRaisesRegex(ValueError, "found 0"):
                SDK.resolve("24.10.0", "x86/64")
        filename = "openwrt-sdk-24.10.0-test.Linux-x86_64.tar.xz"
        with patch.object(SDK, "urlopen", side_effect=[io.BytesIO(f'<a href="{filename}">SDK</a>'.encode()), io.BytesIO(b"invalid checksum")]):
            with self.assertRaisesRegex(ValueError, "No checksum"):
                SDK.resolve("24.10.0", "x86/64")

    def test_catalogues_cover_every_actual_source_and_menu_string(self):
        strings = set()
        for file in (ROOT / "htdocs").rglob("*.js"):
            strings.update(re.findall(r"(?:_|i18n\.t)\('([^']*)'\)", file.read_text()))
        menu = json.loads((ROOT / "root/usr/share/luci/menu.d/luci-app-device-manager.json").read_text())
        strings.update(item["title"] for item in menu.values())
        for file in [ROOT / "po/templates/device-manager.pot", ROOT / "po/zh_Hans/device-manager.po"]:
            catalogue = {json.loads(line[6:]) for line in file.read_text().splitlines() if line.startswith("msgid ")}
            catalogue.discard("")
            self.assertEqual(catalogue, strings)

    def test_selected_configuration_preserves_target_and_disables_sdk_all_defaults(self):
        spec = importlib.util.spec_from_file_location("configure_sdk", ROOT / "tools/configure-sdk.py")
        configure = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(configure)
        with tempfile.TemporaryDirectory() as tmp:
            directory = pathlib.Path(tmp)
            (directory / "rules.mk").touch()
            (directory / "Makefile").touch()
            (directory / ".config").write_text("CONFIG_TARGET_x86=y\nCONFIG_ALL=y\nCONFIG_ALL_KMODS=y\nCONFIG_ALL_NONSHARED=y\nCONFIG_PACKAGE_unrelated=y\nCONFIG_LUCI_LANG_de=y\n")
            configure.configure(directory)
            result = (directory / ".config").read_text()
            self.assertIn("CONFIG_TARGET_x86=y", result)
            self.assertIn("# CONFIG_ALL_KMODS is not set", result)
            self.assertIn("CONFIG_PACKAGE_luci-app-device-manager=m", result)
            self.assertIn("CONFIG_PACKAGE_luci-i18n-device-manager-zh-cn=m", result)
            self.assertNotIn("CONFIG_PACKAGE_unrelated", result)
            self.assertNotIn("CONFIG_LUCI_LANG_de", result)
            configure.configure(directory)
            self.assertEqual((directory / ".config").read_text(), result)
            with self.assertRaises(ValueError):
                configure.configure(directory / "not-an-sdk")


if __name__ == "__main__":
    unittest.main()
