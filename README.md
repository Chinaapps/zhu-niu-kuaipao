# 🐷 猪妞快跑 · 阳光漫游

> 原《四友快跑》定制版 —— 一个用 **three.js** 打造的 3D 跑酷小游戏。

## 🎮 在线试玩

| 平台 | 链接 |
|------|------|
| 🌐 GitHub Pages | https://chinaapps.github.io/zhu-niu-kuaipao/ |
| ☁️ 豆包永久链接 | https://4kgz4yzxqn84v.doubaoapps.com/app/app_17ey2ks560w |

## ✨ 特色

- **3D 跑酷玩法**：跑、跳、收集金币，阳光漫游主题场景
- **角色替换**：四友角色 → 戴草帽的豚鼠「猪妞」
- **金币 = 牛奶盒**：游戏里的圆形金币全部改成了印着「野生猪妞奶」包装的**方形牛奶盒 3D 模型**
- **金币不减反增**：购买服装送金币，吃金币加金币，越玩越富有

## 📁 项目结构

```
├── index.html          # 入口页面
├── game.js             # 3D 游戏主逻辑（含牛奶盒金币实现）
├── engine.js           # 游戏引擎 / 收集逻辑
├── economy.js          # 金币经济系统（不减反增）
├── mobile-boot.js      # 移动端引导 / 动态加载
├── assets/             # 图片、模型贴图、角色资源
│   ├── milk-box.png    # 方形牛奶盒贴图
│   ├── characters.js   # 角色与纹理映射
│   └── models/         # 3D 角色贴图
└── vendor/             # three.js 等第三方库
```

## 🛠️ 技术栈

- [three.js](https://threejs.org/)（r150+，3D 渲染）
- 原生 JavaScript / CSS / HTML
- GitHub Pages + 豆包 Apps 双端部署

## 📦 本地运行

直接用浏览器打开 `index.html` 即可，无需构建步骤。

## 📜 说明

本项目由豆包部署、豆包操作、豆包放置文件、豆包修改 😁
