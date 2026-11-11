// Claude 가 만든 SVG 를 저장하기 전에 검사한다. 스크립트, 외부 참조, 글자가 있으면 버린다.
export function extractSvg(text) {
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  return m ? m[0].trim() : null;
}

export function checkSvg(svg) {
  if (!svg) return 'SVG 가 없음';
  if (svg.length > 24_000) return '너무 큼';
  if (!/^<svg[^>]*viewBox=["']0 0 353 196["']/i.test(svg)) return 'viewBox 가 다름';
  if (/<\s*(script|foreignObject|image|iframe|use|style|a|text|animate|set)\b/i.test(svg)) return '허용하지 않는 요소';
  if (/\son[a-z]+\s*=/i.test(svg)) return '이벤트 속성';
  if (/(href|src)\s*=/i.test(svg)) return '외부 참조';
  if (/url\(\s*["']?(?!#)/i.test(svg)) return '외부 url()';
  if (/javascript:|data:/i.test(svg)) return '위험한 주소';
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return 'DOCTYPE';
  return null;
}
