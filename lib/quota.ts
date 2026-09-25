/**
 * 额度管理（MVP：LocalStorage 按日重置）
 * - 每天免费 3 次 AI 处理（去水印 / 抠图），次日零点自动重置
 * - 免费次数用完后消耗充值积分
 * - 体验会员有效期内每天额外发放 10 积分
 */

export const DAILY_FREE_LIMIT = 3;
export const MEMBER_DAILY_CREDITS = 10;

export interface QuotaState {
  date: string; // YYYY-MM-DD，用于跨天重置
  usedToday: number; // 今日已用免费次数
  credits: number; // 积分余额（充值获得）
  memberUntil: number | null; // 会员到期时间戳（毫秒）
  memberGrantedDate: string | null; // 会员每日积分最近一次发放日期
}

const STORAGE_KEY = "tuke-quota-v1";
export const QUOTA_EVENT = "tuke-quota-change";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function defaultState(): QuotaState {
  return {
    date: todayStr(),
    usedToday: 0,
    credits: 0,
    memberUntil: null,
    memberGrantedDate: null,
  };
}

export function loadQuota(): QuotaState {
  if (typeof window === "undefined") return defaultState();

  let state: QuotaState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch {
    state = defaultState();
  }

  const today = todayStr();

  // 跨天重置免费次数
  if (state.date !== today) {
    state.date = today;
    state.usedToday = 0;
  }

  // 会员每日积分发放（体验会员：每天额外赠送 10 积分）
  if (state.memberUntil && state.memberUntil > Date.now()) {
    if (state.memberGrantedDate !== today) {
      state.credits += MEMBER_DAILY_CREDITS;
      state.memberGrantedDate = today;
    }
  }

  saveQuota(state);
  return state;
}

export function saveQuota(state: QuotaState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(QUOTA_EVENT));
}

export function remainingToday(state: QuotaState): number {
  return Math.max(0, DAILY_FREE_LIMIT - state.usedToday);
}

export interface ConsumeResult {
  ok: boolean;
  source?: "free" | "credits";
}

/** 消耗一次 AI 处理额度：优先免费次数，其次积分。失败（额度不足）由调用方弹付费引导。 */
export function tryConsume(): ConsumeResult {
  const s = loadQuota();
  if (s.usedToday < DAILY_FREE_LIMIT) {
    s.usedToday += 1;
    saveQuota(s);
    return { ok: true, source: "free" };
  }
  if (s.credits > 0) {
    s.credits -= 1;
    saveQuota(s);
    return { ok: true, source: "credits" };
  }
  return { ok: false };
}

/** 与 tryConsume 对称的失败退款：优先回退免费次数，否则返还积分 */
export function refundLast(): void {
  const s = loadQuota();
  if (s.usedToday > 0) s.usedToday -= 1;
  else s.credits += 1;
  saveQuota(s);
}

/* ── 以下为 MVP「手动充值 + 后台改额度」预留的演示入口 ──
   正式接入支付后，由支付回调调用的接口替代。 */

export function grantCredits(n: number): void {
  const s = loadQuota();
  s.credits += n;
  saveQuota(s);
}

export function activateMember(days: number): void {
  const s = loadQuota();
  const base = s.memberUntil && s.memberUntil > Date.now() ? s.memberUntil : Date.now();
  s.memberUntil = base + days * 24 * 60 * 60 * 1000;
  saveQuota(s);
}
