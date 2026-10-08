# luci-app-device-manager

[![Code Lint & Tests](https://github.com/openwrt/luci-app-device-manager/actions/workflows/lint.yml/badge.svg)](https://github.com/openwrt/luci-app-device-manager/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个轻量级的 OpenWrt LuCI 局域网设备管理插件。实现类似小米、华硕、TP-Link 等家用路由器的设备管理体验，自动识别局域网设备与在线状态，允许用户根据 **MAC 地址**自定义修改设备显示名称、备注及设备分组，配置永久保存。

---

## 一、功能特性

- **局域网设备自动发现**：基于 LuCI 原生 `network.getHostHints()` 及 DHCP 租约接口，自动获取已知设备的 MAC、IPv4/IPv6 地址与系统检测主机名。
- **可靠的在线状态识别**：
  - **不把 Host Hints 或 DHCP 租约简单等同于在线**。
  - 整合 Wi-Fi 关联列表（`assoclist`）与 Linux 内核网络邻居表状态（`ip neigh` / `/proc/net/arp`）。
  - 仅在存在可靠近期通信证据（Wi-Fi 在线连接、内核状态为 `REACHABLE`、`DELAY`、`PROBE`）时标记为**在线**。
  - 近期无活动证据（`STALE`）或无法证实存活的设备标记为**状态未知**。
  - 探测失败（`FAILED`）或当前网络完全失联的设备标记为**离线**。
- **状态 Tab 筛选与动态计数**：
  - 设备列表上方提供四个状态 Tab：**全部设备**、**在线设备**、**离线设备**、**状态未知**。
  - 每个 Tab 动态显示对应状态的实时设备数量。
  - 切换 Tab 时无需重新加载整个 LuCI 页面，支持与搜索、分组筛选任意组合使用。
- **自定义设备分组管理**：
  - 默认提供常用业务分组：**智能家居**、**手机设备**、**电脑设备**、**网络设备**、**其他设备**以及虚拟默认组**未分组**。
  - 完整支持**新增分组**、**重命名分组**与**删除分组**。
  - 分组采用稳定 ID 映射，修改分组名称不会丢失设备关联。
  - 删除分组时，该组下的设备自动安全转为“未分组”，**绝不删除设备本身及其自定义名称和备注**。
- **浏览器记忆功能（localStorage）**：
  - 自动在浏览器中保存最后一次选择的**状态 Tab**和**分组筛选**（存储键名：`luci-device-manager-view`）。
  - 页面刷新、关闭浏览器重新打开后自动无缝恢复上次筛选状态。
  - 纯客户端本地隔离存储，不向服务器发送多余请求，不存储 MAC、备注等敏感设备数据。
  - 具备健壮的容错机制：分组被删除或数据损坏时自动优雅回退，绝不导致页面崩溃。
- **设备显示名称与备注自定义**：
  - 优先显示用户设置的设备自定义名称（如“客厅电视”、“工作电脑”），清空后可无缝恢复系统默认主机名。
  - 独立存储用户文本备注（如“55寸安卓电视，安装在客厅”）。
- **以 MAC 为主键，去重与稳定性保证**：
  - 所有记录以规范化大写 MAC 地址（如 `AA:BB:CC:11:22:33`）为主键匹配，IP 变动不影响已保存的备注和分组。
  - 历史离线设备完整保留，即使设备关机或拔线，已保存的数据不丢失。
- **UCI 标准持久化存储**：
  - 配置持久化存储于 `/etc/config/device_manager`，软件包升级或路由器重启均不丢失用户数据。
- **响应式与多主题兼容**：
  - 遵循 LuCI 原生设计规范，完美适配桌面与手机端屏幕，兼容默认主题、Argon 等常见主题。

---

## 二、实际实现状态（V1.1）

| 模块 / 功能 | 状态 | 说明 |
|---|---|---|
| LuCI 菜单（网络 → 设备管理） | ✅ 已实现 | 标准 JSON 菜单，order 60 |
| rpcd ACL 权限隔离 | ✅ 已实现 | 最小权限原则，包含必要 hosthints、neigh 及 UCI 读写 |
| 局域网设备发现与单 MAC 去重 | ✅ 已实现 | 整合 Host Hints 与 DHCP 租约 |
| 状态 Tab 筛选（全部/在线/离线/未知） | ✅ 已实现 | 实时动态计数，前端即时切换 |
| 可靠在线状态识别 | ✅ 已实现 | 结合 Wi-Fi 关联列表与内核网络邻居状态（REACHABLE / STALE / FAILED） |
| 自定义设备分组（增删改、分配） | ✅ 已实现 | 稳定 ID，删除分组设备自动降级为未分组，设备不丢失 |
| 浏览器记忆（localStorage） | ✅ 已实现 | 记住最后 Tab 和分组，防崩溃回退，敏感信息零留存 |
| 自定义设备名称与备注编辑 | ✅ 已实现 | 支持中文、英文、数字及符号，名称与备注分离 |
| 设备列表与分组列展示 | ✅ 已实现 | 列表直接展示设备分组标签，清晰直观 |
| UCI 配置持久化与生命周期管理 | ✅ 已实现 | `/etc/config/device_manager`，稳定 section ID |
| 历史离线设备管理 | ✅ 已实现 | 离线设备仍保留展示与编辑，状态标识区分 |
| 实时多条件模糊搜索 | ✅ 已实现 | 支持名称、主机名、IP、MAC、备注、分组联合过滤 |
| 手动录入新增设备 | ✅ 已实现 | 支持在设备入网前手动登记 MAC、分组与备注 |
| 删除备注记录确认弹窗 | ✅ 已实现 | 原生 LuCI 模态框确认，防止误触 |
| 页面手动无刷新重新载入 | ✅ 已实现 | 异步载入，携带动态 Loading 动画 |
| 自动化单元测试与 Lint CI | ✅ 已实现 | 31 项测试覆盖状态识别、Tab计数、分组生命周期与本地存储 |

---

## 三、界面结构与截图位置

### 访问路径
登录 OpenWrt LuCI 管理后台后，在左侧或顶部导航栏进入：
**网络 → 设备管理**

直接访问地址：
`http://<路由器IP>/cgi-bin/luci/admin/network/device-manager`

### 界面设计示意图
```text
+---------------------------------------------------------------------------------------------------+
| 局域网设备管理                                                                                     |
| 自动识别局域网设备在线状态，支持按 MAC 地址自定义显示名称、备注和设备分组，配置永久保存。          |
|                                                                                                   |
| [ 全部设备 (4) ]  [ 在线设备 (2) ]  [ 离线设备 (1) ]  [ 状态未知 (1) ]                             |
|                                                                                                   |
| [ 搜索设备名称、主机名、IP、MAC、备注、分组... ]  [ 全部分组 v ]  [分组管理] [+ 手动添加设备] [刷新列表]|
+---------------------------------------------------------------------------------------------------+
| 设备名称            | IP 地址        | MAC 地址          | 分组     | 备注           | 操作         |
+---------------------+----------------+-------------------+----------+----------------+--------------+
| 客厅电视            | 192.168.1.100  | AA:BB:CC:11:22:33 | 智能家居 | 55寸安卓电视   | [编辑] [删除]|
| (android-8fd231)    |                |                   |          |                |              |
| [在线] (Wi-Fi 活跃) |                |                   |          |                |              |
+---------------------+----------------+-------------------+----------+----------------+--------------+
| 工作电脑            | 192.168.1.101  | AA:BB:CC:44:55:66 | 电脑设备 | 主力开发机     | [编辑] [删除]|
| (my-pc)             |                |                   |          |                |              |
| [在线] (REACHABLE)  |                |                   |          |                |              |
+---------------------+----------------+-------------------+----------+----------------+--------------+
| 备用打印机          | —              | 11:22:33:44:55:66 | 未分组   | 离线备用       | [编辑] [删除]|
| [离线] (历史记录)   |                |                   |          |                |              |
+---------------------+----------------+-------------------+----------+----------------+--------------+
| 智能插座            | 192.168.1.102  | 99:88:77:66:55:44 | 智能家居 | —              | [编辑]       |
| [状态未知] (STALE)  |                |                   |          |                |              |
+---------------------------------------------------------------------------------------------------+
```

---

## 四、支持的 OpenWrt 版本

本插件基于 OpenWrt 官方推荐的**现代 LuCI 客户端 JavaScript 框架**开发：
- **OpenWrt 24.10 系列**（支持良好，默认打包为 `.ipk`）
- **OpenWrt 23.05 系列**（支持良好）
- **OpenWrt 22.03 系列**（支持良好）
- **OpenWrt 25.12 系列**（支持兼容，支持 APK 包格式）

**依赖项**：仅依赖 `luci-base`，无需安装 Python、Node.js 等大型外部运行时。

---

## 五、安装与卸载方法

### 安装软件包
在路由器 SSH 中执行安装：
- OpenWrt 24.10 及更早版本（`opkg`）：
  ```bash
  opkg update
  opkg install luci-app-device-manager_1.0.0-1_all.ipk
  ```
- OpenWrt 25.12 及更新版本（`apk`）：
  ```bash
  apk add luci-app-device-manager_1.0.0-1_all.apk
  ```

安装后清理缓存并重启 `rpcd`：
```bash
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd restart
```

### 卸载软件包
```bash
opkg remove luci-app-device-manager
# 或
apk del luci-app-device-manager
```
卸载时，用户的 `/etc/config/device_manager` 配置文件将安全保留。

---

## 六、开发与免打包部署调试

项目提供了自动化开发部署脚本 `tools/deploy.sh`，在开发阶段无需反复打包，可直接将最新前端、后端 RPC 辅助脚本与配置同步到测试路由器。

```bash
# 基本用法（将 192.168.1.1 替换为实际路由器 IP）
./tools/deploy.sh 192.168.1.1

# 指定 SSH 用户或端口
./tools/deploy.sh -p 2222 root@192.168.31.1
```

脚本会自动：
1. 部署前端视图到 `/www/luci-static/resources/view/device-manager/`；
2. 部署菜单与 rpcd ACL 文件至 `/usr/share/luci/menu.d/` 与 `/usr/share/rpcd/acl.d/`；
3. 部署轻量后端 RPC 辅助脚本到 `/usr/libexec/rpcd/luci.device-manager` 并授权；
4. 初始化默认分组并完整保护已有设备配置；
5. 自动清理 LuCI 索引缓存并重启 `rpcd` 服务。

---

## 七、数据存储与 UCI 配置规范

配置文件路径：`/etc/config/device_manager`。

### 配置文件结构示例

```text
config group 'smart_home'
    option name '智能家居'

config group 'phone'
    option name '手机设备'

config group 'computer'
    option name '电脑设备'

config device 'dev_aabbcc112233'
    option mac 'AA:BB:CC:11:22:33'
    option name '客厅电视'
    option remark '55寸安卓电视'
    option group 'smart_home'

config device 'dev_aabbcc445566'
    option mac 'AA:BB:CC:44:55:66'
    option name '工作电脑'
    option remark '主力开发电脑'
    option group 'computer'
```

### 字段说明
- **`config group '<group_id>'`**：
  - `name`：分组展示名称（支持中文、英文）。
- **`config device '<section_id>'`**：
  - Section ID 采用合法的 `dev_<全小写MAC>`（如 `dev_aabbcc112233`）。
  - `mac`：规范化大写冒号分隔 MAC 地址。
  - `name`：自定义设备显示名称（可选）。
  - `remark`：用户自定义备注（可选）。
  - `group`：关联的分组 ID（可选，未设置或找不到时自动归入“未分组”）。

---

## 八、软件包编译构建与测试

### 本地单元测试验证
在本项目根目录下直接运行全量测试套件：
```bash
node test/test_device_manager.js
```

### 使用 OpenWrt SDK 构建
```bash
./scripts/feeds update -a
./scripts/feeds install luci-base
ln -s /path/to/luci-app-device-manager package/luci-app-device-manager
printf 'CONFIG_PACKAGE_luci-app-device-manager=m\n' >> .config
make defconfig
make package/luci-app-device-manager/compile V=s -j$(nproc)
```

---

## 九、关于 MAC 地址随机化的注意事项

现代智能移动设备（如 iOS、Android 10+ 以及 Windows 11）普遍默认开启了“**私有局域网地址 / MAC 地址随机化**”隐私保护功能。

- 当设备在不同无线网络重连或周期性轮换随机 MAC 时，路由器会将其识别为不同的新设备。
- **建议**：如需对常用设备进行稳定长期的名称、备注及分组管理，建议在设备的 Wi-Fi 设置中，针对家庭路由器的无线信号将“私有无线局域网地址”调整为“**使用设备 MAC / 关闭专用地址**”。

---

## 十、License

本项目采用 [MIT License](LICENSE) 开源授权。
