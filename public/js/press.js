// 印刷的濾鏡（css/print.css 用）：#inked 讓大字的邊緣吃進紙裏，#brush 讓朱筆圈有筆鋒，手抖一點、略微發乾。第一次打開規則書或介紹卡時放進頁面
const SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="inked" x="-1%" y="-4%" width="102%" height="108%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale=".8" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="brush" x="-4%" y="-8%" width="108%" height="116%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="4" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3.4" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency=".5 .09" numOctaves="2" seed="8"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.3"/>
    <feComposite in="d" operator="in"/>
  </filter>
</svg>`;

export function inkFilters() {
  if (!document.getElementById('inked')) document.body.insertAdjacentHTML('beforeend', SVG);
}
