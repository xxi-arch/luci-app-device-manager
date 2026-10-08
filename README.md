# luci-app-device-manager

## 中文

轻量级 OpenWrt LuCI 局域网设备管理插件。

- **自动发现设备**：展示设备名称、MAC、IPv4 和 IPv6 地址。
- **设备类型与图标识别**：根据 MAC 地址 OUI 及主机名智能识别设备类型（台式机、笔记本、手机、平板、电视、电视盒子、NAS、打印机、摄像头、音箱、游戏机、路由器、交换机、AP、服务器、插座、灯具、传感器、智能家居、手表、汽车、VR、网络设备、空调、洗衣机、冰箱、净水器、空气净化器等 29 类），并在表格第一列展示 Material Design 图标（Pictogrammers MDI），支持手动自定义。
- **设备状态识别**：区分在线、离线与状态未知。
- **分批主动探测**：限制并发和单次探测时间，多个页面共享探测锁；30 秒内不重复探测，未完成的扫描在后续刷新继续。
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
- **Device type & Material Design icons**: Automatically identifies device type based on MAC address OUI and hostnames (29 types including computers, laptops, phones, tablets, TVs, TV boxes, NAS, printers, cameras, speakers, game consoles, routers, switches, APs, servers, plugs, lights, sensors, smart home, watches, cars, VR headsets, network devices, air conditioners, washing machines, refrigerators, water purifiers, and air purifiers) and displays Material Design icons (Pictogrammers MDI) in the first column, with manual override support.
- **Device status**: Distinguish online, offline and unknown states.
- **Batched active probing**: Bound concurrency and scan duration across all clients; avoid repeat probing for 30 seconds and resume unfinished scans on later refreshes.
- **Custom names and remarks**: Save names, locations and purposes by MAC address.
- **Device groups**: Create, rename, delete and assign groups without losing device information.
- **Quick filtering**: Combine status, group and keyword filters with device counts.
- **Manual registration**: Add devices before they join the network, using just a MAC address.
- **Saved device history**: Manage saved offline devices and retain configuration across reboots.
- **Remembered filters**: Restore the last selected status and group.
- **Automatic Chinese and English**: Follow the LuCI language setting or browser language.
- **Read-only access**: View and refresh devices while editing remains permission controlled.
