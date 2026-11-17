# Leaf Mark 产品说明

<!-- impeccable:product-schema 1 -->

## Platform

Chrome Manifest V3 扩展，使用原生 HTML、CSS 和 JavaScript，无构建步骤及运行时依赖。默认点击工具栏图标打开独立页面，可主动启用启动和新标签页入口。

## Users

需要集中浏览、归类和排序网站收藏的 Chrome 用户。

## Product Purpose

在分类网格中展示全部书签，提供 Google 全网搜索、网址直达和本地整理功能。

## Capabilities and Constraints

- 读取 Chrome 书签，并在原生书签变化后刷新；按域名和标题在本地推荐分类。
- 新建、重命名和删除分类；空分类仍可见、可拖入书签。删除分类保留原书签。
- 分类内书签及侧栏文件夹可拖动排序，跨分类拖动可归类；展示顺序仅在本地保存，不调整 Chrome 原生顺序。最近收藏保持按时间排列。
- 分类拖动接受整个侧栏的落点；列表下方空白排至最后，侧栏外松手或按 Esc 取消。支持 Alt + 方向键排序。
- 书签右键菜单提供打开、另存为、复制地址、重命名、删除与原生检查入口。重命名只改本地显示名；确认删除会移除 Chrome 原书签。
- 搜索词提交后进入 Google，域名和 HTTP/HTTPS 网址直接访问。始终在新标签页打开，不保存搜索历史。
- 启动和新标签页入口默认关闭，主动开启时请求可选 tabs 权限。保持 Chrome 主页、恢复会话和默认搜索设置。
- 自动将白色、近白色透明单色图标显示为黑色；其他图标保留原样，不修改源图。
- 动态助手循环播放本地待机视频，点击弹出问候气泡，尚未提供对话、转换或翻译服务。

## Brand Commitments

品牌为 Leaf Mark，使用手写艺术字、浅色玻璃控件、深色文字和浅灰白＋柔和粉蓝动态背景。保留中文分类导航与桌面多列布局；窄窗口使用顶部导航和更少网格列。标题为 Take the first step on your journey.

## Implementation Decisions

分类、显示名和顺序通过 chrome.storage.local 保存，不由插件提供跨设备同步。自动分类基于有限的本地规则，可手动纠正；不会上传书签。背景及人物在隐藏页面时暂停，减少动态效果时改为静止展示。权限与数据处理详见 [PRIVACY.md](PRIVACY.md)，界面实现详见 [DESIGN.md](DESIGN.md)。
