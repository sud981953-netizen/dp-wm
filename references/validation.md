# dp-wm 1.0.0 验证记录

验证日期：2026-10-25（Asia/Shanghai）。测试数据均为示例，不是真实客户订单。

## 已完成

- `node scripts/check.cjs`：18 项通过，包括常规/春节/闰月、农历腊月跨公历年、进场日期跨年、日期缺项与冲突、输入别名、姓名身份顺序、占位拒绝、金额与小数尾款、脚本文本注入隔离。
- 对照香港天文台 2025、2026、2027 三个完整公历年度 CSV：逐日校验农历干支年、月份（含闰月）、日期，1,095 天全部相符。
- 完整出图：农历 2026 年九月廿三 → 阳历 2026-11-01 → 进场 2026-10-31；图片宽 1440px，完整长图，未拆页。
- 重复生成：第一版总价 5000、定金 1000、尾款 4000；第二版总价 6000、定金 1000、尾款 5000。第二版更新主图片，第一版及 HTML、原始输入、核对数据全部进入历史目录；旧图 SHA-256 未变。
- 390px 手机页面无横向溢出；浏览器无脚本错误。实际查看完整导出图片，Logo、心形符号、行楷字体、装饰、日期、金额、服务条款及页尾均完整显示。
- Skill frontmatter 通过官方 `quick_validate.py` 检查。结构校验不等于模型自动选用验证，客户端需要重新发现本地技能。

## 日期依据

- [香港天文台公历与农历对照表](https://www.hko.gov.hk/sc/gts/time/conversion.htm)
- [2025 CSV](https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2025.csv)
- [2026 CSV](https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2026.csv)
- [2027 CSV](https://data.weather.gov.hk/weatherAPI/hko_data/calendar/nongli_calendar_2027.csv)
- 换算库：[lunar-javascript 官方仓库](https://github.com/6tail/lunar-javascript)，1.7.7，负月份表示闰月。发布包 SHA-512 integrity：`sha512-u/KYiwPIBo/0bT+WWfU7qO1d+aqeB90Tuy4ErXenr2Gam0QcWeezUvtiOIyXR7HbVnW2I1DKfU0NBvzMZhbVQw==`。

运行生成时使用本地库，不上传订单或请求网页。1901—2099 是脚本允许输入的农历年范围，并不表示已逐日独立验证整个范围；独立全量对照覆盖的是 2025—2027。

## 依赖与来源

- `vendor/lunar-javascript`：1.7.7，原包 `lunar.js`、`index.js`、`package.json`、MIT LICENSE 原样保留。
- `vendor/playwright-core`：1.60.0，原包及许可文件保留（附带 trace 的 SKILL.md 更名为 TRACE_GUIDE.md，防止误注册为额外技能）；本机已使用 Chrome 实际跑通。
- html2canvas 1.4.1 已嵌在 HTML 内，保留其许可证注释。
- Logo 来自用户指定的本地图片；原尺寸过大，展示用图已在原模板内缩放嵌入。
- 公开版本使用 SIL OFL 1.1 许可的 Ma Shan Zheng 字体替代不可确认分发权的本机字体；其余布局和文案沿用确认稿。
- `assets/approved-original.html` 是最终设计的演示存档，公开版已替换开源字体；它包含演示字段，日常出图只使用清空字段入口的 `assets/template.html`。

## 复验

```text
node scripts/check.cjs
node scripts/generate.cjs --input references/example-order.txt --output <绝对路径的测试目录>
```

检查脚本 JSON 返回的文件，实际打开 PNG 查看。示例数据只能输出到单独测试目录，不混入真实订单目录。


## v1.1.0 公开发布与更新验证

- 添加固定仓库 `sud981953-netizen/dp-wm` 的正式 Release 更新流程。
- 更新器 6 项隔离测试通过：首次安装、替换和旧官方文件清理、备份与用户文件保留、已是最新版、损坏包不覆盖、越界 ZIP 拒绝、版本不符拒绝、目标目录保护和新增文件冲突保护（部分同一测试覆盖多个分支）。
- 原有 18 项订单验证仍通过；公开版字体替换后已实际导出完整 PNG 并查看，日期、金额、Logo、标题及正文完整。
- 发布包使用 Ma Shan Zheng（SIL OFL 1.1）内嵌字体；本机原始设计与安装版已在发布前单独备份，不随公开仓库上传。
