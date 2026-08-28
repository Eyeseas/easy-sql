/** 客户端入口：由 Layout.astro 引入一次，串起各模块。 */
import { initProgress } from './progress';
import { initTimer } from './timer';
import { initGenerator } from './generator';
import { initView, initScrollSpy } from './view';
import { initLlmSettings } from './llmSettings';

function boot(): void {
  initView();
  initProgress();
  initTimer();
  initLlmSettings();
  initGenerator();
  initScrollSpy();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
