// 브라우저 없이 화면 없는 코드(core, holidays, sms)만 불러와서 시험한다.
// 같은 전역 범위를 쓰는 스크립트라 vm 안에서 차례로 실행하면 앱과 똑같이 이어진다.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 문자에는 연도가 없어서 '지금'에 따라 결과가 달라지므로 시계를 고정한다
export const NOW = new Date(2026, 10, 3, 12, 0, 0);   // 2026-11-03 12:00
class FixedDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(NOW.getTime()); }
  static now() { return NOW.getTime(); }
}

export function loadApp(items = []) {
  const ctx = vm.createContext({ console, Date: FixedDate, items });
  for (const f of ['core', 'holidays', 'sms']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', `${f}.js`), 'utf8'), ctx, { filename: `js/${f}.js` });
  }
  const run = (code) => vm.runInContext(code, ctx);
  return { ctx, run, setItems: (list) => { ctx.items = list; } };
}
