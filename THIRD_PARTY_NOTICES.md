# 来源与依赖

本项目从作者的模型目录可视化页面中提取星系布局、相机、轨道运动、粒子过渡和 Canvas 渲染模块。独立演示使用合成数据，并重新编写数据入口、详情面板和背景层。

原页面中使用的 React Bits Aurora / Gradient ASCII 衍生背景没有包含在此仓库中。`AmbientBackground.tsx` 使用 Canvas 字符绘制与 CSS 渐变实现独立的装饰背景。

运行依赖：

| 依赖 | 许可 |
| --- | --- |
| React、React DOM | MIT |
| Lucide React | ISC，部分图标来自采用 MIT 的 Feather |
| Zod | MIT |

构建依赖包括 Vite、TypeScript、tsx、React 插件和类型声明。各依赖适用其自身的许可，安装后的完整声明位于对应依赖目录。项目自有代码适用根目录的 MIT 许可证。

字体使用设备系统字体。仓库未附带第三方字体文件、原业务数据库、品牌图片或服务端代码。
