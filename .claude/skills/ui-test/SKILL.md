---
name: ui-test
description: 在《血染钟楼魔典》里用真实页面实测：验证界面、交互、动画改动，截图给用户看，查桌面 / 手机竖屏 / 横屏的布局和遮挡，一步跳到某个局面（第 N 夜某角色那一步、第 N 天、提名中、等裁定、结束），存档恢复、改完代码热更新，派子代理测试员试玩。改了 public/ 或 lib/ 里会影响画面的代码、要看效果或截图时先读它。Use for verifying UI changes, screenshots, playtests and reaching a game state in this project.
---

# 真实页面实测（tools/uitest）

引擎直接造出局面 → 真实页面打开到那一刻 → 像人一样点（每一下先做命中测试）。
不要为了看一个白天的改动去从建房、发角色、走完第一夜重放；也不要拿接口调用代替页面操作——错位、遮挡、点不到只有真页面才看得出。

如果你是被派来**扮演玩家试玩**的测试员：只读 `tools/uitest/README.md`「实测员须知」，只用那里列的基础命令，下面的开发者命令（preset、load、sync、eval、measure…）一律不用。

## 第一步：摆局面

```bash
node tools/uitest/ui.mjs 3912 preset script=tb mode=one n=7 at=day1
```

- 没有 rig 在跑就自动在后台起一台（`auto3910`：服务 3910、调试 3911、控制 3912，闲置 90 分钟自己关）。别的会话可能也在用 3912：先 `node tools/uitest/ui.mjs 3912 status`，被占了就用自己的十位（3922、3932…，控制端口 = 基准 + 2）。
- 返回：用了几秒、停在哪、座位表（谁是什么角色）、开了哪几台设备、每台一张截图。一般 2–4 秒就绪。
- 代码是 rig 启动那一刻工作区的快照（含别的会话改了一半的东西）。之后改代码用 `sync`，不用重起。

| 参数 | 例子 | 说明 |
|---|---|---|
| `script` | `tb` `bmr` `snv` `tools/uitest/scripts/wugang.json` | 默认 tb |
| `mode` | `online` `many` `one` | 线上 / 线下多设备 / 线下单设备，默认 online |
| `n` | `7` | 人数，默认 7 |
| `roles` | `imp,poisoner,chef,empath,monk,drunk>slayer,soldier` | 按座位指定全部角色；`>` 后是酒鬼以为的角色 |
| `with` | `juggler` `imp@3` | 只指定几个，其余按规则抽（固定种子，同样参数每次一样；`seed=2` 换一组） |
| `at` | `lobby` `night1` `night2:imp` `night1:dawn` `day1` `day1:nominate=3>1` `day1:slay=3>1` `end:good` | 停在：准备阶段、某夜开头、某角色那一步（还没选）、天亮前确认、第几天、提名中、等猎手裁定、结束 |
| `pick.<角色>[@夜]` | `pick.imp@2=7` `pick.fortuneteller=2,3` | 那个角色选谁（座位号）；不写就自动选合规的 |
| `dead` | `2,4` | 到了以后标成死亡 |
| `phones` | `all` `none` `1,3` | 线上 / 多设备开哪几台手机；默认只开夜里轮到的那个人 |
| `stsize` `phonesize` | `375x664` `844x390` | 设备尺寸；默认说书人 1280x800、手机 375x664 |
| `shot=0` `pass=0` | | 不截图；单设备第一夜保留「传阅身份」卡 |

设备名：`st` 说书人，`p<座位号>` 玩家手机（单设备局没有手机）。需要确定谁是什么角色就写 `roles=` 或 `with=`，默认抽出来的可能有酒鬼、男爵之类。
要停的角色不在场、已经死了或今晚不醒，preset 会直接说为什么到不了。

## 拿到局面以后

基础命令（`node tools/uitest/ui.mjs 3912 <命令>`；一条 Bash 里可以 `&&` 连几条）：
- `look <设备>`：屏幕上的文字区域、座位、能点的东西（带坐标）、被挡住或在屏幕外的东西。
- `tap <设备> <按钮文字> [第几个]`、`seat <设备> <座位号>`、`tapxy`、`type`、`key`、`scroll`、`hover`：真的鼠标事件，点之前命中测试，被挡住就不点并报告。之后自动附一份 `look`。
- `who`（每台设备轮到谁）、`shot <设备>`（当下这一帧）、`errors`（页面报错）、`serverlog`、`wait <毫秒>`、`resize`。
- `at=night2:imp` 停在他**还没选**：选人牌上的「确认」是灰的。要看选好以后的样子，先 `seat p3 4`（线下是说书人 `seat st 4`）再看、再截。`shot` 只截当下这一帧，所以操作完再截；`preset`、`load`、`views` 的截图会等转场播完。
- 问「某个按钮在不在屏幕里、点不点得到」：`look` 里的「能點的 / ⚠ 點不到的」就是答案（带中心坐标，被谁挡住）；要精确的边界再用 `measure`，选择器写到那个按钮本身（例 `.turn-pane button`）。

开发者命令：
- `views <设备> [all|宽x高…]`：一次截几种尺寸，截完回原尺寸。默认说书人 电脑 / 375x664 / 844x390；`all` 是手机规矩里的全套（375x664、375x553、360x640、320x568、844x390，说书人再加 1280x800）。
- `save <名字>` / `load <名字>` / `saves`：存档点（房间 + 每台设备的身份和网址），各台 rig 通用，读档约 3 秒。反复验同一步（点一下看结果、改代码再点）时先存。
- `sync [文件…]`：把改过的文件同步进快照。只动 `public/` 刷新页面（约 1 秒）；动到 `lib/`、`server.js` 先写盘再重启服务（约 2.5 秒）。房间都不丢。**只验自己的改动就列出文件**，不列会把别的会话改了一半的也带进来。
- `fast on|off`：加速（页面当作开了「减少动态效果」，演出直接跳到结尾；其余动画 8 倍速）。走流程时开，看动画效果前一定关。
- `measure <设备> <选择器> [样式 / --变量…]`：位置尺寸 + 计算样式，例 `measure st .obit top --hole-y`。`eval <设备> <JS>`：只用来读数据、查原因，不拿它代替点击。
- `reload [设备]`、`restart`、`devices`、`drop <设备>`、`status`、`close`。
- 验某个提交而不是工作区：`git -c core.autocrlf=false archive <提交> public lib server.js package.json | tar -x -C <草稿目录>`，然后后台跑 `node tools/uitest/rig.mjs <名字> <端口> src=<草稿目录> [局面参数…]`，等它打印 `RIG READY`。

## 常见做法

- **白天 / 夜里某张卡的改动**：`preset … at=<那一步>` → `look` / `tap` 走到要看的状态 → `views st` → 用 Read 看截图。
- **线上玩家手机上的东西**：`mode=online`，`phones=` 开那几台；`views p3` 截手机三种尺寸。
- **一个按钮点了会怎样，要反复试**：摆到点之前 → `save before` → 点、看 → 改代码 → `sync <文件>` → `load before` → 再点。
- **矮屏 / 横屏有没有挡住关键按钮**：`views st all`，再对可疑的 `measure` 量出具体位置。
- **给用户在内置浏览器面板里看**：`link st` 给出带说书人密钥的网址，`preview_start {url}` 打开；再用 `javascript_tool` 跑它给的那行关声音的 JS。玩家手机用 `link p3`（之后 rig 里的 p3 会被顶掉）。看完 `preview_list` + `preview_stop`。**不往 `.claude/launch.json` 加测试服务**：面板每个文件夹最多 5 个服务，闲置会话的配置会一直占着名额。
- **规则逻辑本身**（不涉及画面）：写在 `tests/` 里用引擎测，不用这个。

## 验收和交付（项目规矩）

- 桌面、手机竖屏、横屏都看；布局改动三种都截图发给用户（SendUserFile）。只说「去哪看」不算交付。
- 看画面上的东西：遮挡、溢出、点不到、信息层级、给说书人的话有没有出现在玩家手机上（反过来也一样）、玩家不该看到的信息。
- 每个阶段跑一次 `errors` 和 `serverlog`。
- 浏览器一直静音（rig 自带 `--mute-audio`；面板用 `link` 给的 JS）。
- rig 每次启动会清空自己的目录（截图也在里面），要给用户的截图先拷出去。用完 `close`。

## 派测试员（子代理整局试玩）

- 每人一套 rig：`node tools/uitest/rig.mjs <名字> <基准端口>`（后台），各人错开端口（3310、3320、3330…）。也可以先自己 `preset` / `load` 摆好，再把控制端口和「现在停在哪」告诉他，省掉建房那段。
- 让他读 `tools/uitest/README.md`「实测员须知」，再写清剧本、按座位发什么角色、每一步做什么、预期看到什么。预期越具体，越容易发现不对。按任务挑便宜的模型。
- 他的报告逐条核对后再转述：看他的截图、查发给玩家的数据、在引擎里复现。常见误报：把官方规则当错（麻脸巫婆不改阵营、MVP 总数含说书人），把 `look` 的显示格式当成界面问题。
