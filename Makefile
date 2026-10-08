include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for LAN Device Management
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-device-manager
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWrt Community

define Package/$(PKG_NAME)/conffiles
/etc/config/device_manager
endef

-include $(TOPDIR)/feeds/luci/luci.mk
ifneq ($(findstring luci.mk,$(MAKEFILE_LIST)),)
# loaded feeds/luci/luci.mk
else
include ../../luci.mk
endif

# call BuildPackage - OpenWrt buildroot signature

