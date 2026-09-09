/**
 * 复盘素材索引，全站共用的一份静态 JSON（见 scripts/reviewCore 的 reviewSourceAll）。
 *
 * 站点 output 是 static，这个路由在构建期就写成 dist/review-source.json，不进
 * Worker。今日复盘的固定三格由服务端渲染、不依赖它；补漏格与到期错题才需要它，
 * 所以拉不到的时候只是这两类不出现，页面照常能用（见 scripts/review）。
 */
import type { APIRoute } from 'astro';
import { allDays } from '../data';
import { reviewSourceAll } from '../scripts/reviewCore';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(reviewSourceAll(allDays)), {
    headers: { 'content-type': 'application/json' },
  });
