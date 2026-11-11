import { describe, expect, it } from 'vitest';
import { checkSvg, extractSvg } from './svg-check.mjs';

const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 353 196"><circle cx="10" cy="10" r="5" fill="#FF5A1F"/></svg>';
const wrap = inner => ok.replace('<circle', inner + '<circle');

describe('SVG 검사', () => {
  it('설명 글 사이에서 SVG 만 꺼낸다', () => {
    expect(extractSvg('Here you go:\n```svg\n' + ok + '\n```')).toBe(ok);
    expect(extractSvg('no picture')).toBeNull();
  });
  it('규칙에 맞는 그림은 통과한다', () => expect(checkSvg(ok)).toBeNull());
  it('스크립트, 외부 참조, 글자를 막는다', () => {
    for (const bad of [
      wrap('<script>alert(1)</script>'),
      wrap('<image href="https://example.com/a.png"/>'),
      wrap('<text x="1" y="1">agenda</text>'),
      wrap('<rect onload="x()" width="1" height="1"/>'),
      wrap('<rect fill="url(https://example.com/p)" width="1" height="1"/>'),
      wrap('<foreignObject></foreignObject>'),
      ok.replace('0 0 353 196', '0 0 100 100'),
      null,
    ]) expect(checkSvg(bad)).not.toBeNull();
  });
});
