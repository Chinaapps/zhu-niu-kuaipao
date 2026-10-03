# Liquid Glass 数学计算器（网页版）

一个**纯计算器**：不含任何单位换算。**任意精度、任意大数**，等一会儿即可算出，**不会计算超时**。

- 支持全部数学运算符号与函数
- 液态玻璃（Liquid Glass）界面 + WebGL 流动背景
- 同一套引擎同时提供 **Python 版**（`calculator.py`）与 **网页/APK 版**

## 在线使用

> GitHub Pages：`https://chinaapps.github.io/zn/calculator/`

## 功能

| 分类 | 支持内容 |
|---|---|
| 四则运算 | `+` `−` `×` `÷` |
| 幂与根 | `xʸ`、`√` `∛` `n√`、指数 `exp` |
| 取模与整除 | `%`（取模）、`//`（整除） |
| 三角/反三角 | `sin` `cos` `tan` `asin` `acos` `atan` |
| 双曲 | `sinh` `cosh` `tanh` |
| 对数/指数 | `ln` `log₁₀` `log₂` `log(x,b)`、`eˣ` |
| 常数 | `π` `e` `φ` `τ` |
| 数论 | `gcd` `lcm` 素数判定 `isprime` 下一素数 `nextprime` 质因数分解 `factor` |
| 组合 | `n!` 阶乘、`nCr` 组合数、`nPr` 排列数 |
| 其他 | 绝对值、`floor` `ceil`、`min` `max`、`±`、百分号 |

## 文件说明

```
calculator/
├── index.html      页面结构
├── style.css       液态玻璃主题样式
├── script.js       计算引擎（JS 版）+ 界面交互 + WebGL 背景
├── calculator.py   计算引擎（Python 版，同规则、任意精度）
├── assets/         图标等资源
└── README.md       说明文档
```

## 引擎说明

- **Python 版**（`calculator.py`）：整数/分数用 Python 原生 `int` 无限精度，超越函数用 `decimal` 高精度泰勒级数，可作命令行 REPL 运行：`python3 calculator.py`
- **网页/APK 版**（`script.js`）：用 `BigInt` 实现精确有理数与定点高精度小数，镜像 Python 同一套运算规则，精度可调（30~200 位）。

## 精度调节

右上角可切换 30 / 50 / 80 / 120 / 200 位小数精度，计算速度不受影响（大数运算毫秒级完成）。

## 部署

本目录已部署到 GitHub Pages（`gh-pages` / `main` 分支），并作为 Android APK 的 WebView 内嵌资源。
