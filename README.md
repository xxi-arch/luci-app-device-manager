# luci-app-device-manager

## 中文

轻量级 OpenWrt LuCI 局域网设备管理插件。

- **自动发现设备**：展示设备名称、MAC、IPv4 和 IPv6 地址。
- **设备状态识别**：区分在线、离线与状态未知。
- **名称与备注**：自定义设备名称、位置和用途，按 MAC 地址长期保存。
- **设备分组**：支持新增、重命名、删除分组及分配设备；删除分组保留设备信息。
- **快速筛选**：按状态、分组和关键词组合搜索，显示对应设备数量。
- **手动登记**：提前添加尚未入网的设备，支持只填写 MAC 地址。
- **历史记录保留**：管理已保存的离线设备，重启后配置仍然保留。
- **记忆筛选条件**：自动恢复上次选择的状态和分组。
- **中英文自动切换**：随 LuCI 语言设置或浏览器语言显示中文、英文。
- **只读访问**：只读账号可查看和刷新，编辑操作受权限控制。

## English

A lightweight LAN device manager for OpenWrt LuCI.

- **Automatic discovery**: View device names, MAC addresses, IPv4 and IPv6 addresses.
- **Device status**: Distinguish online, offline and unknown states.
- **Custom names and remarks**: Save names, locations and purposes by MAC address.
- **Device groups**: Create, rename, delete and assign groups without losing device information.
- **Quick filtering**: Combine status, group and keyword filters with device counts.
- **Manual registration**: Add devices before they join the network, using just a MAC address.
- **Saved device history**: Manage saved offline devices and retain configuration across reboots.
- **Remembered filters**: Restore the last selected status and group.
- **Automatic Chinese and English**: Follow the LuCI language setting or browser language.
- **Read-only access**: View and refresh devices while editing remains permission controlled.
