# luci-app-device-manager

[![Code Lint & Tests](https://github.com/openwrt/luci-app-device-manager/actions/workflows/lint.yml/badge.svg)](https://github.com/openwrt/luci-app-device-manager/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个轻量级的 OpenWrt LuCI 局域网设备管理插件。实现类似小米、华硕、TP-Link 等家用路由器的设备管理体验，自动识别局域网设备，允许用户根据 **MAC 地址**自定义修改设备显示名称与备注信息，并永久持久化保存。

---

## 一、功能特性

- **局域网设备自动发现**：基于 LuCI 原生 `network.getHostHints()` 及 DHCP 租约接口，自动获取已知设备的 MAC、IPv4/IPv6 地址与系统检测主机名。
- **设备显示名称自定义**：为设备设置友好的自定义名称（如“客厅电视”、“工作电脑”），列表优先展示，清空后可无缝恢复系统默认主机名。
- **独立设备备注管理**：支持添加详细的文本备注（如“55寸安卓电视，安装在客厅”），名称与备注分离存储。
- **以 MAC 为主键，去重与稳定性保证**：所有记录以规范化大写 MAC 地址（如 `AA:BB:CC:11:22:33`）为主键匹配，IP 地址变动不影响已保存的备注。
- **历史与离线设备保留**：设备短暂离线或关机不会丢失已保存的配置，支持在管理界面中查看与维护历史设备。
- **UCI 标准持久化存储**：配置存储于 `/etc/config/device_manager`，软件包升级或路由器重启均不丢失用户数据。
- **实时搜索与筛选**：支持按设备名称、主机名、IP、MAC、备注快速模糊搜索，并支持按“全部/已发现/已保存备注/历史记录”快速筛选。
- **手动添加设备**：支持在设备入网前手动输入 MAC、名称及备注进行预先登记。
- **轻量原生、零额外常驻开销**：基于纯 LuCI JavaScript 与 OpenWrt 原生 ubus/rpcd 机制，不引入 Node.js、MySQL、SQLite 或独立后台常驻进程，不修改原生网络与防火墙配置。
- **响应式与多主题兼容**：完全采用 LuCI 原生 UI 组件与自适应样式，完美适配桌面与手机浏览器，兼容默认 Bootstrap、Argon 等常见主题。

---

## 二、实际实现状态（V1.0）

| 模块 / 功能 | 状态 | 说明 |
|---|---|---|
| LuCI 菜单（网络 → 设备管理） | ✅ 已实现 | 标准 JSON 菜单，order 60 |
| rpcd ACL 权限隔离 | ✅ 已实现 | 最小权限原则，仅声明自身 UCI 与必要 hosthints 读写 |
| 局域网设备发现与合并 | ✅ 已实现 | 整合 Host Hints 与 DHCP 租约，单 MAC 去重 |
| 自定义设备名称编辑 | ✅ 已实现 | 支持中文、英文、数字及符号，可清空恢复默认 |
| 设备备注编辑与清空 | ✅ 已实现 | 多行文本备注输入，独立持久化 |
| UCI 配置自动生成与保存 | ✅ 已实现 | `/etc/config/device_manager`，稳定 section ID |
| 历史离线设备管理 | ✅ 已实现 | 离线设备仍保留展示与编辑，状态标识区分 |
| 实时多条件搜索与分类筛选 | ✅ 已实现 | 前端秒级过滤，实时统计当前显示设备数量 |
| 手动录入新增设备 | ✅ 已实现 | 支持在页面中直接录入指定 MAC 进行管理 |
| 删除备注记录确认弹窗 | ✅ 已实现 | 原生 LuCI 模态框确认，防止误触 |
| 页面手动无刷新重新载入 | ✅ 已实现 | 按钮动态加载动画，无需整页刷新 |
| 自动化单元测试与 Lint CI | ✅ 已实现 | 30 项测试覆盖规范化、合并、去重、搜索及 UCI 生命周期 |
| 跨网段主动 ARP 扫描探测 | ⏳ 规划中 | 后续版本视硬件资源按需引入轻量脚本 |
| 流量监控与单设备限速联动 | 💡 未来考虑 | 未来大版本规划 |

---

## 三、界面结构与截图位置

### 访问路径
登录 OpenWrt LuCI 管理后台后，在左侧或顶部导航栏进入：
**网络 → 设备管理**

直接访问地址：
`http://<路由器IP>/cgi-bin/luci/admin/network/device-manager`

### 界面设计示意图
```text
+---------------------------------------------------------------------------------------+
| 局域网设备管理                                                                         |
| 自动发现局域网已知设备，支持按 MAC 地址自定义显示名称与备注信息，配置永久生效。        |
|                                                                                       |
| [全部设备: 4]  [已发现: 3]  [已保存备注: 2]  [当前显示: 4]                             |
|                                                                                       |
| [ 搜索设备名称、主机名、IP、MAC、备注... ]  [全部设备 v]    [+ 手动添加设备] [刷新列表]  |
+---------------------------------------------------------------------------------------+
| 设备名称          | IP 地址        | MAC 地址          | 备注           | 操作        |
+-------------------+----------------+-------------------+----------------+-------------+
| 客厅电视 [已发现] | 192.168.1.100  | AA:BB:CC:11:22:33 | 55寸安卓电视   | [编辑][删除]|
| (android-8fd231)  |                |                   |                |             |
| 主力工作电脑[已发现]192.168.1.101  | AA:BB:CC:44:55:66 | 主力开发机     | [编辑][删除]|
| 未知设备 [已发现] | 192.168.1.102  | 11:22:33:44:55:66 | —              | [编辑]      |
| 旧打印机 [历史记录]| —              | 99:88:77:66:55:44 | 已断开备用     | [编辑][删除]|
+---------------------------------------------------------------------------------------+
```

> **截图说明**：公开发布后，可将实际渲染截图放置于 `doc/screenshot.png` 并在本处展示。

---

## 四、支持的 OpenWrt 版本

本插件基于 OpenWrt 官方推荐的**现代 LuCI 客户端 JavaScript 框架**开发：
- **OpenWrt 24.10 系列**（支持良好，默认打包为 `.ipk`）
- **OpenWrt 23.05 系列**（支持良好）
- **OpenWrt 22.03 系列**（支持良好）
- **OpenWrt 25.12 系列**（支持兼容，支持 APK 包格式）

**依赖项**：仅依赖 `luci-base`，无需安装 Python、PHP、Node.js 等重量级运行时。

---

## 五、安装方法

### 方法一：直接安装预编译软件包（Release）

1. 下载对应版本的安装包（例如 `luci-app-device-manager_1.0.0-1_all.ipk`）。
2. 将文件上传至路由器 `/tmp` 目录：
   ```bash
   scp luci-app-device-manager_1.0.0-1_all.ipk root@192.168.1.1:/tmp/
   ```
3. 在路由器 SSH 中执行安装：
   - OpenWrt 24.10 及更早版本（`opkg`）：
     ```bash
     opkg update
     opkg install /tmp/luci-app-device-manager_1.0.0-1_all.ipk
     ```
   - OpenWrt 25.12 及更新版本（`apk`）：
     ```bash
     apk add /tmp/luci-app-device-manager_1.0.0-1_all.apk
     ```
4. 清理缓存并刷新浏览器：
   ```bash
   rm -f /tmp/luci-indexcache*
   /etc/init.d/rpcd restart
   ```

### 卸载方法

```bash
opkg remove luci-app-device-manager
# 或 OpenWrt 25.12+:
apk del luci-app-device-manager
```
卸载时，用户的 `/etc/config/device_manager` 备注配置文件将被安全保留，不会意外丢失。

---

## 六、开发与免打包部署调试

项目提供了自动化开发部署脚本 `tools/deploy.sh`，在开发阶段无需反复打包，可直接将最新前端与配置同步到测试路由器。

### 部署命令

```bash
# 基本用法（将 192.168.1.1 替换为实际路由器 IP）
./tools/deploy.sh 192.168.1.1

# 指定 SSH 用户或端口
./tools/deploy.sh root@192.168.1.1
./tools/deploy.sh -p 2222 root@192.168.31.1
```

### 脚本行为
1. 自动校验本地源文件完整性。
2. 将前端文件部署至路由器 `/www/luci-static/resources/view/device-manager/`。
3. 部署菜单与 rpcd ACL 文件至 `/usr/share/luci/menu.d/` 与 `/usr/share/rpcd/acl.d/`。
4. 部署并执行 `root/etc/uci-defaults/80_device_manager`。
5. **保护已有配置**：若路由器已存在 `/etc/config/device_manager`，绝不覆盖，确保用户已存备注安全。
6. 自动清理 LuCI 索引缓存并重启 `rpcd` 服务。

---

## 七、数据存储与 UCI 配置规范

用户配置存储于标准 OpenWrt UCI 文件：`/etc/config/device_manager`。

### 配置文件结构示例

```text
config device 'dev_aabbcc112233'
    option mac 'AA:BB:CC:11:22:33'
    option name '客厅电视'
    option remark '55寸安卓电视，安装在一楼客厅'

config device 'dev_aabbcc445566'
    option mac 'AA:BB:CC:44:55:66'
    option name '主力工作电脑'
    option remark '台式主机'
```

### 字段说明
- **Section ID**：使用 `dev_` 加上全小写无分隔符的 12 位十六进制 MAC 地址构成（如 `dev_aabbcc112233`），合法且唯一。
- **`mac`**：标准的 17 位大写冒号分隔物理地址。
- **`name`**：用户自定义设备显示名称（可选）。
- **`remark`**：用户自定义备注内容（可选）。

---

## 八、软件包编译构建方法

### 本地使用 OpenWrt SDK 构建

1. 下载与目标系统架构匹配的 OpenWrt SDK。
2. 进入 SDK 根目录并更新 feeds：
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install luci-base
   ```
3. 将本项目链接或放置到 `package/` 目录：
   ```bash
   ln -s /path/to/luci-app-device-manager package/luci-app-device-manager
   ```
4. 编译软件包：
   ```bash
   printf 'CONFIG_PACKAGE_luci-app-device-manager=m\n' >> .config
   make defconfig
   make package/luci-app-device-manager/compile V=s -j$(nproc)
   ```
5. 在 `bin/packages/<arch>/base/` 或 `bin/packages/<arch>/luci/` 下即可找到编译产物。

### 本地自动化测试验证

在本项目根目录下可直接运行自动化测试套件：
```bash
node test/test_device_manager.js
```

---

## 九、常见问题（FAQ）

### Q1：安装或更新后，LuCI 后台看不到“设备管理”菜单？
**答**：通常是因为 LuCI 缓存未更新或权限未刷新。请在路由器 SSH 中执行：
```bash
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache*
/etc/init.d/rpcd restart
```
然后在浏览器中按 `Ctrl + Shift + R` 强制刷新网页。

### Q2：为什么部分设备显示的主机名为“-”或“未知设备”？
**答**：某些物联网（IoT）设备或特定手机在请求 DHCP 租约时未上报 DHCP Option 12（Host Name）。这是正常网络现象，用户可直接点击“编辑”为其设置易于辨识的自定义名称。

### Q3：旁路由模式下能发现所有设备吗？
**答**：在旁路由（网关路由）拓扑中，如果 DHCP 服务器不在本 OpenWrt 上，本路由器仅能通过 ARP 邻居表探测与其发生直接通信的设备。建议将 OpenWrt 作为局域网的主 DHCP 服务器以获得最完整的设备清单。

---

## 十、关于 MAC 地址随机化的注意事项

现代智能移动设备（如 iOS、iPadOS、Android 10+ 以及 Windows 11）普遍默认开启了“**私有局域网地址 / MAC 地址随机化**”隐私保护功能。

- 当设备在不同无线网络重连或周期性轮换随机 MAC 时，路由器会将其识别为不同的新设备。
- **建议**：如需对家庭常用设备进行稳定长期的名称和备注管理，建议在设备的 Wi-Fi 设置中，针对家庭路由器的无线信号将“私有无线局域网地址”调整为“**使用设备 MAC / 关闭专用地址**”。

---

## 十一、License

本项目采用 [MIT License](LICENSE) 开源授权。
