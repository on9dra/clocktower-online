# A1 魔典台面（日）· 风格样张

- `art-src/table-day-green-original.png`：生成原图，纯绿底，1254×1254。
- `art-src/table-day-cutout-native.png`：抠图后的原尺度素材。
- `art-src/table-day.png`：2048×2048 透明 PNG，整件裁边并规范为正圆尺寸，由原图放大。
- `public/img/art/table-day.webp`：网页交付文件，2048×2048，233.6 KiB，透明圆外。
- `edge-preview.png`：黑、白、灰底边缘检查图。
- `demo.html`：台面与聊天区的离线组合示例，文字和座位由 HTML/CSS 绘制。

外圈装饰，中央留白；无文字、字母、数字、水印。抠图采用 PyMatting 透明度细化及前景去绿污染；未用硬色键删除代替边缘细化。静态图与文件规格已检查，浏览器组合效果和线上接入尚未验证。

本批仅 A1，等待确认后将其作为 A2–B8 的统一风格参考。
