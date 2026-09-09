/**
 * 复盘计划核心：算出某个学习日的「今日复盘」该出哪几条复盘项，以及学员标了
 * 「记得 / 忘了」之后记录怎么变。
 *
 * 与计时核心一样是纯逻辑——不读时钟、不碰 DOM、不碰 localStorage。间隔一律按
 * 学习日编号（D01–D56）往回推，不看真实日历日期：学习日是课程的最小单位，
 * 跳过几天不学不该堆积复盘欠债。取材规则确定性，同一份输入必得同一份输出。
 */
import type { Day, DrillAnswer } from '../types/curriculum';

/** 复盘动作：这一条要学员做什么 */
export type ReviewAction = 'recite' | 'redo' | 'explain';

export const ACTION_LABEL: Record<ReviewAction, string> = {
  recite: '默写',
  redo: '重做',
  explain: '口头解释',
};

/** 今天为什么出现：固定间隔的那一格（值即往回数的学习日数），或到期的错题 */
export type ReviewOrigin = number | 'due';

export interface ReviewItem {
  /** 稳定 id：来源学习日 + 素材类型 + 下标。课程数据不变时跨天稳定 */
  id: string;
  origin: ReviewOrigin;
  action: ReviewAction;
  /** 素材来自哪个学习日 */
  fromDay: number;
  fromTitle: string;
  /** 题面 / 知识点标题，可能带内联 <code> <b> */
  prompt: string;
  /** 折叠区的参考答案。口头解释类没有现成答案时缺省 */
  answer?: DrillAnswer;
}

/** 一条复盘项的内容部分（不含「今天为什么出现」）。客户端按 id 取回内容用 */
export type ReviewMaterial = Omit<ReviewItem, 'origin'>;

/** id -> 素材。天页注入给客户端，让到期的错题也能渲染出完整题面与答案 */
export type ReviewSource = Record<string, ReviewMaterial>;

/* ---------- 取材 ---------- */

/** 取「练」栏第 n 题与它的参考答案。没有这道题（如测评日）返回 null */
function pickDrill(from: Day, idx: number): ReviewMaterial | null {
  const task = from.drill[idx];
  if (!task) return null;
  const answer = from.drillAnswers?.[idx];
  return {
    id: `d${from.no}-drill-${idx}`,
    action: 'redo',
    fromDay: from.no,
    fromTitle: from.title,
    prompt: task,
    ...(answer ? { answer } : {}),
  };
}

/**
 * 取「学」栏第 n 条知识点：小讲义对象取标题（易错点折进答案区，解释完自查），
 * 一行式字符串直接取原文。没有这一条返回 null。
 */
function pickLearn(from: Day, idx: number): ReviewMaterial | null {
  const entry = from.learn[idx];
  if (!entry) return null;
  const base = {
    id: `d${from.no}-learn-${idx}`,
    action: 'explain' as const,
    fromDay: from.no,
    fromTitle: from.title,
  };
  if (typeof entry === 'string') return { ...base, prompt: entry };
  return {
    ...base,
    prompt: entry.title,
    ...(entry.pitfall ? { answer: { note: entry.pitfall } } : {}),
  };
}

/** 一格的规则：往回数几天、要学员做什么、从来源学习日里摘哪份素材 */
interface GapRule {
  gap: number;
  action: ReviewAction;
  pick: (from: Day) => ReviewMaterial | null;
}

/** 三格的取材规则。顺序即渲染顺序：由近及远 */
const RULES: readonly GapRule[] = [
  { gap: 1, action: 'recite', pick: (d) => pickDrill(d, 0) },
  { gap: 3, action: 'redo', pick: (d) => pickDrill(d, 0) },
  { gap: 7, action: 'explain', pick: (d) => pickLearn(d, 0) },
];

/**
 * 某个学习日固定间隔的那几格。
 * 往回越界（如 D01）、来源学习日没有可取素材时，那一格直接不出现——
 * 不补位、不拿别的天顶替、不产出空壳项。
 */
export function reviewPlanFor(dayNo: number, days: readonly Day[]): ReviewItem[] {
  const byNo = new Map(days.map((d) => [d.no, d]));
  const plan: ReviewItem[] = [];

  for (const rule of RULES) {
    const from = byNo.get(dayNo - rule.gap);
    if (!from) continue;
    const material = rule.pick(from);
    if (!material) continue;
    // 固定格的动作由格子决定（同一道题 D+1 是默写、D+3 是重做）
    plan.push({ ...material, action: rule.action, origin: rule.gap });
  }

  return plan;
}

/**
 * 已学过的那些天的复盘素材，注入给客户端。
 * 只带题面与答案、不带讲义正文，条数随学习进度增长——到期的错题可能来自任意
 * 一个过去的学习日，客户端手里没有课程数据，只能靠这份索引把它渲染出来。
 */
export function reviewSourceFor(dayNo: number, days: readonly Day[]): ReviewSource {
  const source: ReviewSource = {};
  for (const d of days) {
    if (d.no >= dayNo) continue;
    for (const m of [pickDrill(d, 0), pickLearn(d, 0)]) {
      if (m) source[m.id] = m;
    }
  }
  return source;
}

/* ---------- 复盘记录 ---------- */

export type ReviewVerdict = 'known' | 'forgot';

/** 一次判定：在哪个学习日标了什么 */
export interface ReviewJudgement {
  dayNo: number;
  verdict: ReviewVerdict;
}

export interface ReviewRecord {
  history: readonly ReviewJudgement[];
  /** 下次到期的学习日号；不再排队时为 null */
  dueOn: number | null;
  /** 连续「记得」次数 */
  streak: number;
}

export const REVIEW_LOG_VERSION = 1;

export interface ReviewLog {
  version: number;
  items: Record<string, ReviewRecord>;
}

export const EMPTY_LOG: ReviewLog = { version: REVIEW_LOG_VERSION, items: {} };

/**
 * 间隔阶梯：标「忘了」掉回第一档，之后每答对一次往上走一档。
 * 单位是学习日，不是日历天。
 */
export const LADDER = [1, 3, 7] as const;

/** 连续答对几次就毕业，不再排队 */
export const GRADUATE_AT = LADDER.length;

/** 每天最多渲染几条到期错题；超出的顺延到之后的学习日（固定格不占这个额度） */
export const DUE_LIMIT = 5;

/** 这一条还在排队吗（在错题本里等下一次到期） */
function queued(rec: ReviewRecord | undefined): boolean {
  return rec !== undefined && rec.dueOn !== null;
}

/** 答对一次之后下次什么时候来；已经走完阶梯就毕业（null） */
function nextDue(dayNo: number, streak: number): number | null {
  const step = LADDER[streak];
  return step === undefined ? null : dayNo + step;
}

function isVerdict(x: unknown): x is ReviewVerdict {
  return x === 'known' || x === 'forgot';
}

/**
 * 把读回来的东西整成一份可用的记录。形状不对、版本不认识就退回空记录——
 * 复盘记录坏了顶多是白复习一遍，不该让天页报错白屏。
 */
export function normalizeLog(raw: unknown): ReviewLog {
  if (typeof raw !== 'object' || raw === null) return EMPTY_LOG;
  const log = raw as Partial<ReviewLog>;
  if (log.version !== REVIEW_LOG_VERSION) return EMPTY_LOG;
  if (typeof log.items !== 'object' || log.items === null) return EMPTY_LOG;

  const items: Record<string, ReviewRecord> = {};
  for (const [id, value] of Object.entries(log.items)) {
    if (typeof value !== 'object' || value === null) continue;
    const rec = value as Partial<ReviewRecord>;
    if (!Array.isArray(rec.history)) continue;
    if (rec.dueOn !== null && typeof rec.dueOn !== 'number') continue;
    if (typeof rec.streak !== 'number') continue;

    const history = rec.history.filter(
      (h): h is ReviewJudgement =>
        typeof h === 'object' && h !== null && typeof h.dayNo === 'number' && isVerdict(h.verdict),
    );
    if (history.length === 0) continue;

    items[id] = { history, dueOn: rec.dueOn, streak: rec.streak };
  }

  return { version: REVIEW_LOG_VERSION, items };
}

/**
 * 记一次判定。纯函数：返回新记录，不改入参。
 *
 * 标「忘了」：进错题本（毕业过的重新进来），间隔掉回第一档。
 * 标「记得」：还在排队的往上走一档，走完阶梯就毕业；本来就不在排队的
 * （固定格里顺手答对的）不因此被拉进错题本。
 */
export function applyVerdict(
  log: ReviewLog,
  id: string,
  dayNo: number,
  verdict: ReviewVerdict,
): ReviewLog {
  const prev = log.items[id];
  const history = [...(prev?.history ?? []), { dayNo, verdict }];
  const streak = verdict === 'known' ? (prev?.streak ?? 0) + 1 : 0;
  const dueOn =
    verdict === 'forgot' ? nextDue(dayNo, 0) : queued(prev) ? nextDue(dayNo, streak) : null;

  return {
    version: REVIEW_LOG_VERSION,
    items: { ...log.items, [id]: { history, streak, dueOn } },
  };
}

/** 进过错题本吗（忘过至少一次）。已毕业的也算——它仍是自己的薄弱面 */
export function isMistake(rec: ReviewRecord): boolean {
  return rec.history.some((h) => h.verdict === 'forgot');
}

/** 这一条今天标过什么？没标过返回 null */
export function verdictOn(log: ReviewLog, id: string, dayNo: number): ReviewVerdict | null {
  const history = log.items[id]?.history;
  if (!history) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h && h.dayNo === dayNo) return h.verdict;
  }
  return null;
}

/** 今天（含之前欠下的）到期的复盘项 id，按到期先后排定 */
export function dueIds(dayNo: number, log: ReviewLog): string[] {
  return Object.entries(log.items)
    .filter(([, rec]) => rec.dueOn !== null && rec.dueOn <= dayNo)
    .sort(([aId, a], [bId, b]) => (a.dueOn ?? 0) - (b.dueOn ?? 0) || aId.localeCompare(bId))
    .map(([id]) => id);
}

/**
 * 今天要做的错题项。exclude 里的（固定格已经占了的）不重复出。
 * 素材索引里查不到的 id 静默丢弃——课程内容改过之后的旧记录就属于这种。
 *
 * 最多给 DUE_LIMIT 条，欠得再多这一段也得在 8 分钟里做得完；剩下的不销账，
 * 到期日仍在，之后的学习日照样排队（按到期先后，先欠的先还）。
 */
export function dueItems(
  dayNo: number,
  log: ReviewLog,
  source: ReviewSource,
  exclude: ReadonlySet<string> = new Set(),
): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const id of dueIds(dayNo, log)) {
    if (items.length >= DUE_LIMIT) break;
    if (exclude.has(id)) continue;
    const material = source[id];
    if (!material) continue;
    items.push({ ...material, origin: 'due' });
  }
  return items;
}
