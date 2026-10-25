# dp-wm · 完美婚庆订单图片

给 AI 一段新人订单资料，得到一张完整的婚礼服务订单确认图片。

农历自动换算阳历，进场日期自动设为婚礼前一天，尾款自动计算。使用暖白纸纹、花枝和开源手写字体的固定 HTML 模板；图片按阳历婚期和新郎姓名命名，客户订单分别归档。

## 给智能体的安装指令

复制下面这段话给支持本地 Skill 和文件执行的智能体：

> 请从 https://github.com/sud981953-netizen/dp-wm 安装 dp-wm 技能。下载最新 Release 中的 dp-wm.zip，核对同版本 dp-wm.zip.sha256，再把包内 dp-wm 文件夹安装到你的技能目录。阅读 SKILL.md，检查 Node.js 18+、Python 3.9+（更新功能）和 Chrome/Edge，然后告诉我安装结果。不要把客户订单放进技能目录。

- [最新版本与下载](https://github.com/sud981953-netizen/dp-wm/releases/latest)
- [直接下载技能包](https://github.com/sud981953-netizen/dp-wm/releases/latest/download/dp-wm.zip)
- [校验文件](https://github.com/sud981953-netizen/dp-wm/releases/latest/download/dp-wm.zip.sha256)
- Codex 默认技能位置：`~/.codex/skills/dp-wm`；其他智能体使用其实际技能目录。
- 这是 Agent Skill，不是独立聊天机器人。客户端需能发现技能、运行本地程序、读取文件及展示图片；不同客户端的 `/` 菜单注册方式不同。

## 生成订单

```text
/dp-wm
农历婚期：2026年九月廿三
新人姓名：新郎姓名 💗 新娘姓名
客户联系方式：
婚礼地点：
当天现场对接人：
现场对接人电话：
订单总金额 / 元：
已收定金 / 元：
收款日期：
```

农历必须带年份，闰月注明“闰”；收款日期是定金实际收款的完整阳历日期。新郎在前、新娘在后，身份不明确时智能体会先核实。所有必填信息齐全后才生成真实订单，不用示例数据代填。

```text
订单/2026/2026-11-01_陈明_周宁/
├─ 2026-11-01_陈明.png
├─ 订单资料/
│  ├─ 订单确认单.html
│  ├─ 原始输入.txt
│  └─ 日期与金额核对.json
└─ 历史版本/（修改后出现）
```

模板保留完美婚庆 Logo、门店联系方式及已确认文案。日期区仅显示阳历婚期和完整农历年月日；尾款结清时间固定“婚礼结束当天”。其他门店不能只改文件名冒用，应先明确修改品牌和服务约定。

## 更新技能

对智能体说：

```text
DP-WM-update
```

也支持 `/dp-wm-update`、`更新 dp-wm`、`把完美婚庆技能更新到最新版`。技能会运行：

```text
python <已安装的dp-wm目录>/scripts/update.py
```

更新器只从本仓库最新正式 Release 下载，验证整包 SHA-256 和每个文件的清单，再备份、替换。旧版官方文件不再混留于当前目录；备份 ZIP 放在技能父级的 `skill-backups/dp-wm/`。新增的用户文件会保留，和新版同名冲突时停止更新。订单目录不会被清理。

已是同一版本且文件完好时不重复替换；下载或校验失败时不动旧版。安装目录中的 Git 开发仓库不会被覆盖，维护者应使用 Git 管理源码。

## 环境与隐私

- 生成：Node.js 18+、Chrome 或 Edge。浏览器不在默认位置时设置 `DP_WM_BROWSER` 为其可执行文件路径。
- 更新：Python 3.9+ 和能访问 GitHub 的网络。
- Playwright 和农历库随技能打包。生成订单时使用本地资源，浏览器外网请求被禁止；不会上传客户资料到 GitHub。
- 发布包不含真实客户订单。`references/example-order.txt` 是测试数据；`assets/approved-original.html` 是设计演示存档，不用于交付真实订单。

## 维护与验证

```text
node scripts/check.cjs
python scripts/test_update.py
python scripts/build_release.py
```

Release 产物位于仓库旁的 `release/`，不混入源码。版本号在 `scripts/build_release.py` 管理。修改后重新构建 `package-manifest.json`，提交并发布同版本的 ZIP 与 SHA-256 文件。

历法与版式验证记录见 [references/validation.md](references/validation.md)。2025—2027 三年的 1,095 天已与香港天文台数据逐日对照；其他年份不声称已逐日独立验证。

代码使用 MIT；第三方库、字体和品牌素材的许可分别见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
