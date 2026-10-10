include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for LAN Device Management
LUCI_DEPENDS:=+luci-base +rpcd-mod-file +rpcd-mod-iwinfo +jshn +flock +PACKAGE_ip-full:ip-full +!PACKAGE_ip-full:ip-tiny
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=zhang <zhang747@126.com>

PKG_LICENSE:=MIT Apache-2.0
PKG_LICENSE_FILES:=LICENSE htdocs/luci-static/resources/device-manager/device-icons/LICENSE

define Package/luci-app-device-manager/conffiles
/etc/config/device_manager
endef

define Build/Prepare/luci-app-device-manager
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/root/usr/share/licenses/luci-app-device-manager
	$(INSTALL_DATA) ./LICENSE $(PKG_BUILD_DIR)/root/usr/share/licenses/luci-app-device-manager/LICENSE.MIT
endef

# In-tree LuCI applications use the relative include. Standalone SDK builds
# use the installed feed, where this package lives outside applications/.
ifneq ($(wildcard ../../luci.mk),)
include ../../luci.mk
else
include $(TOPDIR)/feeds/luci/luci.mk
endif

# call BuildPackage - OpenWrt buildroot signature
