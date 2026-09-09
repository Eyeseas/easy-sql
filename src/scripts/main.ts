/** 客户端入口：由 Layout.astro 引入一次，串起各模块。 */
import { initProgress } from './progress';
import { initTimer } from './timer';
import { initGenerator } from './generator';
import { initReview } from './review';
import { initView, initScrollSpy } from './view';
import { initLlmSettings } from './llmSettings';

function boot(): void {
  initView();
  initProgress();
  initTimer();
  initLlmSettings();
  // 复盘先跑：它会把补漏与到期错题写进 #recall-points，随堂默写要读那份
  initReview();
  initGenerator();
  initScrollSpy();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
