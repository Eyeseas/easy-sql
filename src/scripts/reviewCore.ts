/**
 * 复盘计划核心：算出某个学习日的「今日复盘」该出哪几条复盘项。
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

export interface ReviewItem {
  /** 稳定 id：来源学习日 + 素材类型 + 下标。课程数据不变时跨天稳定 */
  id: string;
  /** 往回数了几个学习日（对应复习制度里的 D+1 / D+3 / D+7） */
  gap: number;
  action: ReviewAction;
  /** 素材来自哪个学习日 */
  fromDay: number;
  fromTitle: string;
  /** 题面 / 知识点标题，可能带内联 <code> <b> */
  prompt: string;
  /** 折叠区的参考答案。口头解释类没有现成答案时缺省 */
  answer?: DrillAnswer;
}

/** 取材结果：一格从来源学习日里摘到的东西 */
type Material = Pick<ReviewItem, 'id' | 'prompt' | 'answer'>;

/** 一格的规则：往回数几天、要学员做什么、从来源学习日里摘哪份素材 */
interface GapRule {
  gap: number;
  action: ReviewAction;
  pick: (from: Day) => Material | null;
}

/** 取「练」栏第 1 题与它的参考答案。没有练习题的天（如测评日）返回 null */
function firstDrill(from: Day): Material | null {
  const task = from.drill[0];
  if (!task) return null;
  const answer = from.drillAnswers?.[0];
  return { id: `d${from.no}-drill-0`, prompt: task, ...(answer ? { answer } : {}) };
}

/**
 * 三格的取材规则。顺序即渲染顺序：由近及远。
 * 眼下只有 D+1 一格，D+3 / D+7 随后补齐。
 */
const RULES: readonly GapRule[] = [{ gap: 1, action: 'recite', pick: firstDrill }];

/**
 * 某个学习日的复盘计划。
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
    plan.push({
      ...material,
      gap: rule.gap,
      action: rule.action,
      fromDay: from.no,
      fromTitle: from.title,
    });
  }

  return plan;
}
