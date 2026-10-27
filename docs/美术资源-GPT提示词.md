# 美术资源 · GPT 生成提示词

目标：去掉「米色底 + 1px 细线 + 标准圆角框」的网页 AI 味。只替换大面积底图和仪式场景；文字、数字、功能图标、带状态的控件仍由 HTML/CSS 绘制。

**风格基准：A1 魔典台面第 1 版**（`art-src/A1/table-day.png`，已定稿）。后面每一张都按它的纹样语言来画。

---

## 0. 通用规则

### 分工

出图和接入在两台设备上进行，生成端**不需要读取项目的任何文件**。

| 生成端（GPT） | 项目端（本机） |
|---|---|
| 按本文提示词出图 | 抠图、压缩 webp |
| 交付绿底原图 | 接进演示页的「美術」场景，验证后再上线 |
| 可以附上自己抠好的透明 PNG，作为参考 | 文中「接入」一栏都由本机完成，生成端只需按其中的尺寸出图 |

不用另做素材演示页，也不用标记「原演示页未验证」，演示和验证都在本机做。

### 生成规则

1. 风格参考图就是 **A1 第 1 版台面**（生成端已有的那张：带四角星、卷草、日月的米白圆盘）。**每次生成都附上它**，提示词里写「match the style of the attached reference」。
2. 凡是要透明的，一律出 **纯色 `#00ff00` 背景**，不要自己去背景、不要裁边。纸纹、遮罩类直接出成品。
3. 出图尺寸按各条目的「尺寸」；生成器给不到时，就用它能给的最大正方形或同比例尺寸，**不要放大**。
4. 不能有文字、字母、数字、水印、签名（B1 字标除外）。

### 交付格式

打一个 zip，每项一个文件夹：

```
A2/table-night-green.png        ← 绿底原图（必需）
A2/table-night-cutout.png       ← 自己抠的透明图（可选）
A2/notes.txt                    ← 一行：生成尺寸、是否做过编辑底图
A7/card-frame-green.png
...
```

### A1 的纹样语言（从定稿图里提炼）

| 元素 | 画法 |
|---|---|
| 纸 | 暖象牙色卡纸，有很淡的纤维和小斑点，没有污渍、折痕 |
| 外缘 | 最外一圈细细的暖深棕边线 |
| 框线 | 一粗一细两道墨线，内侧再加一道黄铜细线；遇到主图案时线条断开、让位 |
| 星 | 黄铜四角星，四边内凹，等距排列 |
| 点 | 成排的小墨点，和星交替出现 |
| 卷草 | 三叶小枝：墨橄榄色叶片，配黄铜叶心；成对地护在主图案两侧 |
| 主图案 | 黄铜太阳（长短相间的尖光芒，日面有斑驳质感）、黄铜新月 |
| 黄铜 | 平涂芥末黄铜色，带一点印刷斑驳，**不反光、不发亮** |
| 克制 | 装饰只放在边缘带里，内容区一律是空白纸面 |

### 风格前缀（每条提示词前面都加上）

```
Match the style of the attached reference image exactly (a circular ivory grimoire mat with an ornamental border).
Flat printed board-game art, vintage letterpress on warm ivory card stock with faint fibers and tiny specks.
Ornament vocabulary ONLY from the reference: a thin dark warm-brown outer edge; one thick and one thin ink rule (#2a2622) with a fine brass hairline inside;
brass four-pointed stars with concave sides; rows of tiny ink dots; small three-leaf sprigs with olive-ink leaves and brass centers placed in mirrored pairs;
brass sun with alternating long and short pointed rays and a mottled disc; brass crescent moon. Rules break around a central emblem.
Brass is flat mustard-brass #9a7a2f with slight print mottling — never shiny, never metallic gradient.
Ornaments stay inside narrow borders; content areas are plain empty paper.
NO gradients, NO glow, NO drop shadows, NO 3D render, NO photorealism.
NO text, NO letters, NO numbers, NO watermark, NO signature.
Palette: ink #2a2622, ivory #f4eedf, card #fbf8f0, brass #9a7a2f, muted #7d7365, good blue #2f5d8a, evil crimson #8a1c1c, night navy #4a5272, deep night #141826.
```

---

## P1 · 常驻屏幕

### ✅ A1. 魔典台面（日）— 已定稿

- 第 1 版（带四角星、卷草、日月的那张）定稿，已经接进本机演示页：缩在座位环内侧，80% 透明度。生成端不用再处理。

### A2. 魔典台面（夜）

- **尺寸**：2048×2048，正圆，铺满画布；**透明**：是
- **接入**：`body[data-phase="night"] .ring::before` 换成 `table-night.webp`，日夜两张交叉淡入淡出，替换掉演示页现在的滤镜夜色
- **做法**：把 A1 原图作为**编辑底图**（不是参考图），只换配色，构图必须完全一致

```
[风格前缀]
Edit the attached mat: keep every line, star, dot, sprig, the sun and the moon exactly where they are. Recolor for night only:
paper becomes flat deep navy #1c2236 with the same faint fibers; ink rules become soft blue-gray #5b6275; brass stays brass but about 30% dimmer;
leaves become dark slate. Outer edge a slightly darker navy line. Outside the circle stays solid #00ff00.
```

### A3. 远景小镇，分层（日）

- **尺寸**：每层 3072×768（4:1），底部对齐；**透明**：是
- **分层**：分三次生成 `town-far-day`、`town-mid-day`、`town-near-day`（钟楼在近景层、横向约 45% 处）
- **接入**：`css/fx.css:31-33` `#scene .skyline`，一层 svg 换成三层 div，共用 `background-position: bottom center; background-size: cover`
- **注意**：上方 70% 透明，**不画太阳月亮和云**。纹样语言里只借用纸色、墨线和黄铜点缀：窗户、钟面、尖顶上的风向标可以用黄铜。

```
[风格前缀]
A wide panoramic silhouette layer of a small medieval European town for a parallax background, 4:1, bottom aligned, top 70% empty.
This is the [FAR / MID / NEAR] layer only:
FAR = soft rolling hills and tiny distant rooftops in pale #d3c7ae;
MID = rows of houses, chimneys and two church spires in #a89a7d, a few brass weathervanes;
NEAR = close rooftops in #7d7365 with one tall gothic clock tower at ~45% from the left, its clock face a plain brass disc with a tiny four-pointed star in the middle (no numerals).
Flat cut-paper shapes, thin ink edges, tiny window shapes, the same paper fibers as the reference.
Background solid #00ff00, no sky, no sun, no moon, no clouds.
```

### A4. 远景小镇，分层（夜）

- **尺寸 / 分层**：同 A3，`town-*-night`；**接入**：`fx.css:33` `.skyline-night`
- **做法**：把对应的日景层作为编辑底图

```
[风格前缀]
Edit the attached town layer: identical shapes and positions, recolored for night.
Silhouettes in navy tones (#4a5272 far, #2f3550 mid, #141826 near), a few windows lit in flat warm ivory #f4eedf (no glow, no halo), brass details dimmed.
Background solid #00ff00.
```

### A5. 空座底座

- **尺寸**：512×512，正圆；**透明**：是
- **接入**：`.token.blank`（`css/style.css`，现在是虚线圆）改成 `background: url(../img/art/seat-empty.webp) center/contain; border: 0`。座位号仍然是 HTML 文字
- **注意**：显示只有 34–96px。A1 的纹样要大幅简化：**只保留框线和一圈小星**，不要卷草和点

```
[风格前缀]
A single empty round seat token, top-down, perfectly circular, filling the canvas. It will be shown as small as 40px, so keep it bold and simple.
Ivory card disc; border = the reference's thick ink rule plus brass hairline; between them a ring of 8 small brass four-pointed stars evenly spaced.
No sprigs, no dots, no sun, no moon. Center 70% completely plain for a large number printed later.
Outside the circle solid #00ff00.
```

### A6. 名牌底

- **尺寸**：480×120（4:1）；**透明**：是
- **接入**：`css/board.css:38` `.plate` 改成 `border: 0; background: url(../img/art/plate.webp) center/100% 100%`。宽度随名字伸缩，所以**中间 60% 必须纯平**，装饰只放两端
- 另出红色版 `plate-evil`（框线换成 `#8a1c1c`），用于处决台状态 `.seat.onblock .plate`

```
[风格前缀]
A small horizontal name label, 4:1, flat front view. Ivory card with the reference's thin ink rule and brass hairline as a border, slightly rounded corners.
At each end only: one small brass four-pointed star with a tiny ink dot beside it, mirrored left and right.
The middle 60% is perfectly plain flat ivory so it can stretch horizontally.
Background solid #00ff00.
```

### A7. 纸卡框（九宫格）

- **尺寸**：1024×1024；**透明**：是
- **接入**：`css/hud.css:220` `.pc`（角色揭示、胜利、回合卡、裁定卡）。弹窗 `.modal` 也可以共用这张图
  ```css
  border: 48px solid transparent;
  border-image: url(../img/art/card-frame.webp) 120 fill / 48px stretch;
  background: none; border-radius: 0;
  ```
- **九宫格要求**：四个角各自在 120×120 以内放角饰；**四条边只能是连续直线**（粗墨线 + 细墨线 + 黄铜细线），才能拉伸；中间纯纸面

```
[风格前缀]
A rectangular printed card frame for 9-slice scaling, square canvas, front view.
Border uses the reference's rules: thick ink rule, thin ink rule, brass hairline, all as straight continuous lines along the four edges (no ornaments on the edges, so they can stretch).
Each corner, confined to its own 120px square: a small brass four-pointed star with a mirrored pair of tiny three-leaf sprigs curling along the two rules.
Interior is plain flat ivory card with faint fibers. Outside the card solid #00ff00.
```

### A8. 牌背

- **尺寸**：1024×1024，正圆；**透明**：是
- **接入**：`css/hud.css:188` `.sc-back`（开局翻牌的背面），改成 `background: url(../img/art/card-back.webp) center/cover; border: 0; box-shadow: none`，删掉里面的 `.ico`
- 这是全套里**唯一可以「满花」的一张**：只在翻牌时出现一秒，不和别的内容抢

```
[风格前缀]
The back of a round role token, perfectly circular, filling the canvas. Inverted colors of the reference: deep ink #2a2622 disc with brass ornaments.
Center: a large brass sun with alternating long/short rays; inside its disc a small crescent moon in ink.
Around it a ring of brass four-pointed stars alternating with tiny dots, then the reference border rules in brass (thick, thin, hairline), with mirrored three-leaf sprigs at top, bottom, left and right.
Symmetrical. Outside the circle solid #00ff00.
```

---

## P2 · 仪式场景

### B1. 大厅字标「血染鐘樓」

- **尺寸**：2400×800；**透明**：是
- **接入**：`css/style.css:62` `.lobby .title` 换成 `<img>`，保留 `alt`。繁简各一张（`血染鐘樓` / `血染钟楼`），按 `lang.js` 切换
- GPT 写汉字容易出错，**出图后逐字核对**；屡次出错就只生成装饰（上下两道纹饰），字用 web 字体排

```
[风格前缀 — EXCEPT this image MUST contain the four characters 血染鐘樓 exactly]
A game title wordmark: the four traditional Chinese characters 血染鐘樓 in a bold elegant Song/Ming serif, letterpress ink #2a2622 with slight ink spread; one stroke of 血 carries a small crimson #8a1c1c drip.
Above and below the characters: the reference border rules (thick ink, thin ink, brass hairline) as horizontal lines, broken in the middle by a small brass sun above and a small brass crescent below, each flanked by mirrored three-leaf sprigs and brass four-pointed stars.
Characters must be correct and legible. Background solid #00ff00.
```

### B2. 大厅主视觉

- **尺寸**：1600×1200；**透明**：否
- **接入**：`.lobby` 背景层，`background: url(../img/art/lobby.webp) center bottom/cover`。卡片叠在上面，**上半部和中部留白**
- 顺带从图里裁出钟楼，做 512×512 的 `public/favicon.png`

```
[风格前缀]
Key art for the lobby of an online social deduction game: a medieval town at dusk seen across the bottom third, a gothic clock tower with a plain brass clock face rising from it,
a few townsfolk silhouettes in hooded cloaks in the square and one figure in crimson standing apart.
The top and middle are mostly plain ivory paper sky with a few scattered brass four-pointed stars and tiny dots, leaving room for UI cards.
The whole image is framed by a thin version of the reference border rules.
```

### B3. 开局幕布

- **状态**：帷幔 `curtain-valance` 已经可以用。**幕布 `curtain-drape` 要重出**：第 1 版是用束绳拉开的样子，但这张图用在幕布**合上**的时候（开局前整屏盖住），必须直垂、不束起。
- **尺寸**：1024×2048（竖版）
- **透明**：否，整张铺满，不要绿底
- **接入**：`.cur-drape` 左右两片都用这张图，右片用镜像。手机竖屏上每片大约是 1:4，桌面横屏上大约是 1:1.2，比例差别很大，所以按**横向无缝平铺**来设计：本机会改成按高度铺满、横向重复（`background: bottom left / auto 100% repeat-x`），不再整张拉伸。
- **要求**
  - 褶皱全部是**从顶到底的竖直条带**，宽窄相间，没有斜向收拢、没有束绳、没有流苏挂在中间。
  - **左右两边能无缝接上**：最左一条和最右一条的颜色、粗细要对得上，平铺时看不出接缝。
  - 只有底边有装饰：一条黄铜细线，加一排小四角星和小墨点（和帷幔、A1 同一套）。这条带子也要能横向无缝接上。
  - 顶部不用装饰，会被帷幔盖住。

```
[风格前缀]
A closed theater stage curtain panel, straight and hanging freely, front view, tall vertical 1:2, filling the whole canvas edge to edge (no background, no green).
Flat crimson #8a1c1c with vertical fold bands in darker #741515 and a slightly lighter #a02a22, each band outlined in thin ink, running perfectly straight from the very top to the bottom hem. Flat, not shaded 3D.
NO tie-back, NO rope, NO tassels, NO gathering, NO diagonal folds, NO opening — the curtain is fully closed and hangs straight.
Along the bottom hem only: a brass hairline band with a row of small brass four-pointed stars alternating with tiny ink dots, as in the reference.
The image must tile seamlessly left-to-right: the left edge and the right edge match exactly in color and fold so copies placed side by side show no seam, including the hem band.
```

### B4. 背景天空的太阳、月亮

- **尺寸**：各 512×512；**透明**：是
- **接入**：外圈背景里的 `#scene .moon`（`css/fx.css:18`，76px）和 `#scene .sun-disk`（`fx.css:22`，70px），把纯色圆换成 `background: url(...) center/contain`，删掉 `.sun-disk::after` 的虚线光环。桌布中间的日月已经删掉，这两张只用在背景天空里
- 直接用 A1 里那枚太阳和新月的画法

```
[风格前缀]
(1) The brass sun emblem from the reference, isolated and enlarged: alternating long and short pointed rays, mottled brass disc, thin ink outline. Bold enough to read at 70px.
(2) The brass crescent moon from the reference, isolated, with two tiny brass four-pointed stars beside it.
Each on its own canvas, background solid #00ff00.
```

### B5. 印章斑驳纹理

- **尺寸**：1024×512；交付黑白图（白 = 保留墨，黑 = 缺墨），不用抠图
- **接入**：`css/hud.css:239` `.ink-stamp` 加 `mask-image: url(../img/art/stamp-mask.webp); mask-size: cover; mask-mode: luminance;`。所有印章自动带上缺墨效果，不需要参考图

```
Black and white texture only, no color. A rubber-stamp ink coverage mask: mostly solid white with irregular small black speckles,
dry-brush gaps and slightly broken edges, as if a stamp was pressed unevenly on fibrous card. No shapes, no text, no border. Seamless tileable.
```

### B6. 处决台（分件）

- **尺寸**：`gallows-wood` 1500×1700；`gallows-noose` 200×600；**透明**：是
- **接入**：`js/glyph.js:59` `gallows()` 改为返回 `<img>`，用于 `.blk .gallows`、`.pc-gallows`、`.ex-rig`。摆绳动画的支点是 (75, 6)，所以**横梁末端挂点必须在画布 (750, 60)**，绳套单独出图
- **构图对齐现有线稿**：立柱 x≈220，从 y=60 到底；横梁 (220, 60)→(800, 60)；斜撑 (220, 380)→(540, 60)；底座 (60, 1660)→(580, 1660)

```
[风格前缀]
(1) A wooden gallows frame, side view, flat printed, NO rope: post on the left at x≈15% running full height, beam along the top edge to x≈53%, diagonal brace from 22% height on the post to 36% along the beam, short base plank.
Dark ink-brown wood #2a2622 with simple flat grain lines; brass iron fittings at the joints, each fitting stamped with a tiny four-pointed star; a brass hook at the beam end.
Background solid #00ff00.
(2) A single hanging noose: brass-colored rope #9a7a2f with ink outline, rope top at the very top center of the canvas. Background solid #00ff00.
```

### B7. 结算：皇冠、MVP 奖章、奖杯

- **尺寸**：各 512×512；**透明**：是
- **接入**：皇冠在 `js/scores.js` 绘制（样式 `css/party.css:19-27`），换成 `<img>`；MVP 用在 `.mvp-btn`（`party.css:40`）和 MVP 揭晓场景；奖杯用在积分榜
- 要读得清 32px，纹样只放一两处点缀

```
[风格前缀]
(1) A flat printed royal crown, front view: body in good blue #2f5d8a, ivory band with a row of tiny ink dots, brass points each tipped with a small four-pointed star, thin ink outline.
(2) The same crown, evil version: crimson #8a1c1c body, ink-black band, brass points.
(3) An MVP medal: a brass disc carrying the reference sun emblem, hanging from a ribbon with crimson and blue stripes, ink outline.
(4) A small brass trophy cup with two handles and a tiny four-pointed star on its bowl, ink outline.
Each on its own canvas, bold shapes readable at 32px, background solid #00ff00.
```

### B8. 鸡蛋、蛋渍

- **尺寸**：`egg` 256×320；`egg-splat` 768×768，出 3 种形状；**透明**：是
- **接入**：`js/egg.js` 的 `.egg-fly` / `.egg-splat`（样式 `css/party.css:7-9`），内联 SVG 换成 `<img>`；流淌动画改为整张图缩放和淡出
- 这两张是搞笑元素，**不加纹样**，只沿用纸色、墨线和印刷质感

```
[风格前缀 — but use NO ornaments for this one, only the paper/ink/print feel]
(1) A single whole egg, flat printed: ivory shell #fbf8f0, ink outline, one small flat highlight shape.
(2) A cracked egg splat seen head-on: irregular flat white splash with ink outline, an off-center yolk #e9b53f, a few shell fragments and 2–3 short drips going down. Three different splat shapes.
Background solid #00ff00.
```

---

## 生成顺序

1. **A2 夜版台面**：用 A1 改色，最快，出来就能把演示页的滤镜换掉
2. **A7 卡框、A8 牌背、A5 底座、A6 名牌**：最常出现
3. **A3/A4 小镇分层**（最费时）、B2 大厅主视觉
4. 其余 B 项
