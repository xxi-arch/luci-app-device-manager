include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for LAN Device Management
LUCI_DEPENDS:=+luci-base +rpcd-mod-file +rpcd-mod-iwinfo +jshn +flock +PACKAGE_ip-full:ip-full +!PACKAGE_ip-full:ip-tiny
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=OpenWrt Community

PKG_NAME:=luci-app-device-manager
PKG_VERSION:=1.1.0
PKG_RELEASE:=2
PKG_LICENSE:=MIT

define Package/$(PKG_NAME)/conffiles
/etc/config/device_manager
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
