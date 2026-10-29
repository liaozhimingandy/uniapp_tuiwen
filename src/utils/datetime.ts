/**
 * 时间展示公共模块 —— 全端时区处理的唯一入口
 *
 * 契约（与后端 `src/tuiwen/utils/datetime_utils.py` 对应）：
 * - 后端一律返回 **UTC**，形如 `2026-10-29T06:32:10.123456Z`；
 * - 展示前必须换成**设备本地时区**，服务端不做任何本地化；
 * - 上报给后端的 `X-Timezone` 与本模块判断开放窗口用的是**同一个来源**，
 *   否则会出现「页面显示开放中、接口却返回空列表」。
 *
 * 与 Web 端 `src/common/datetime.ts` 的差异：
 * 小程序基础库不保证有 `Intl`（尤其低版本安卓），所以这里每条路径都有降级：
 * 有 Intl 就按 IANA 时区精确渲染（含夏令时），没有就退回 `Date` 的本地墙钟。
 * 这不是"简化"，而是跨端必须付出的一个分支——写死 `Intl` 会让小程序端直接白屏报错。
 */

/** 合法的时区后缀：Z 或 ±HH:mm / ±HHmm */
const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** 纯日期（只有年月日，没有时分秒） */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 小数秒超过 3 位时截断，避免部分内核解析失败 */
const LONG_FRACTION_RE = /(\.\d{3})\d+/;

/** 时间展示预设 */
export type TimePreset = 'datetime' | 'date' | 'time' | 'full';

/** 当前运行环境是否支持 Intl.DateTimeFormat（小程序端可能没有） */
const hasIntl = (): boolean => typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function';

/**
 * 取当前设备时区的 IANA 名称，如 `Asia/Shanghai`
 *
 * 小程序 / 部分安卓 WebView 拿不到 IANA 名时，退化成 `UTC+08:00` 这种偏移写法。
 * 后端 `resolve_timezone` 对无法识别的名字会回退到业务时区，不会 500。
 */
export function getLocalTimeZone(): string {
  if (hasIntl()) {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) return zone;
    } catch {
      // 继续走偏移兜底
    }
  }
  return `UTC${getLocalTimeZoneOffset()}`;
}

/** 取当前时刻的 UTC 偏移，格式如 `+08:00` */
export function getLocalTimeZoneOffset(date: Date = new Date()): string {
  if (hasIntl()) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: getLocalTimeZone(),
        timeZoneName: 'longOffset',
      }).formatToParts(date);
      const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
      const matched = name.match(/GMT([+-]\d{2}:\d{2})/);
      if (matched) return matched[1];
      if (name === 'GMT' || name === 'UTC') return '+00:00';
    } catch {
      // 老内核不支持 longOffset，退回系统算法
    }
  }
  // getTimezoneOffset() 返回"UTC 减本地"的分钟数，符号与直觉相反，取反才是 UTC+8
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * 把服务端时间解析成 Date（正确的瞬间）
 *
 * - 带偏移的 ISO 串：`...Z`、`...+08:00`
 * - 不带偏移：**按 UTC 解释**（后端契约），而不是 ES2015 默认的"本地时间"
 * - 纯日期 `2026-10-29`：按本地日历 0 点解析（生日这类字段不参与时区换算）
 * - 数字时间戳：10 位按秒、13 位按毫秒
 *
 * @returns 解析失败/空值返回 null，调用方渲染空串而不是 `NaN年NaN月`
 */
export function parseServerTime(input?: string | number | Date | null): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let text = String(input).trim();
  if (!text) return null;

  if (DATE_ONLY_RE.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // `2026-10-29 06:32:10` → ISO 的 T 分隔，部分内核只认 T
  text = text.replace(' ', 'T').replace(LONG_FRACTION_RE, '$1');

  // 没有时区信息就补 Z（按 UTC 解释）。iOS WebView 对缺时区的串行为不一致，必须显式补。
  if (!TZ_SUFFIX_RE.test(text)) text += 'Z';

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 时区相关的字段集合 */
interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

let partsFormatterCache: Intl.DateTimeFormat | null = null;
let partsFormatterZone: string | null = null;

/** 取当前时区对应的格式化器（列表里逐条调用，构造开销必须摊掉） */
function partsFormatter(): Intl.DateTimeFormat | null {
  if (!hasIntl()) return null;
  const zone = getLocalTimeZone();
  if (!partsFormatterCache || partsFormatterZone !== zone) {
    try {
      partsFormatterCache = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      partsFormatterZone = zone;
    } catch {
      return null;
    }
  }
  return partsFormatterCache;
}

/** 取某个时刻在当前时区的各字段 */
function localParts(date: Date): TimeParts {
  const formatter = partsFormatter();
  if (formatter) {
    const parts: Record<string, number> = {};
    for (const part of formatter.formatToParts(date)) {
      if (part.type !== 'literal') parts[part.type] = Number(part.value);
    }
    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      // 个别时区在 24 点整会给出 hour=24，归一成 0
      hour: parts.hour === 24 ? 0 : parts.hour,
      minute: parts.minute,
      second: parts.second,
    };
  }
  // 降级：设备本地墙钟（此时 getLocalTimeZone 也是偏移兜底，两者口径一致）
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

/** 补零 */
const pad = (value: number): string => String(value).padStart(2, '0');

/** 日历日期（不含时分秒，也就没有时区概念） */
interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** 取"上一天"的日历日期：用 UTC 只当纯日历计算器，跨月/跨年由 Date 归一 */
function previousDay(date: CalendarDate): CalendarDate {
  const anchor = new Date(Date.UTC(date.year, date.month - 1, date.day - 1));
  return {year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate()};
}

const isSameDay = (a: CalendarDate, b: CalendarDate): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * 按预设格式化（始终使用设备本地时区）
 *
 * @param preset datetime=`2026-10-29 14:32` / date=`2026-10-29` / time=`14:32` / full=`2026-10-29 14:32:10`
 */
export function formatDateTime(input?: string | number | Date | null, preset: TimePreset = 'datetime'): string {
  // 纯日期本来就是"给人看的那一天"，原样返回，不要被时区推动一天
  const raw = typeof input === 'string' ? input.trim() : '';
  if (preset === 'date' && DATE_ONLY_RE.test(raw)) return raw;

  const date = parseServerTime(input);
  if (!date) return '';
  const {year, month, day, hour, minute, second} = localParts(date);
  const ymd = `${year}-${pad(month)}-${pad(day)}`;
  const hm = `${pad(hour)}:${pad(minute)}`;

  switch (preset) {
    case 'date':
      return ymd;
    case 'time':
      return hm;
    case 'full':
      return `${ymd} ${hm}:${pad(second)}`;
    default:
      return `${ymd} ${hm}`;
  }
}

/** 格式化并附时区偏移，例：`2026-10-29 14:32 (UTC+08:00)` */
export function formatDateTimeWithZone(input?: string | number | Date | null): string {
  const date = parseServerTime(input);
  if (!date) return '';
  return `${formatDateTime(date, 'datetime')} (UTC${getLocalTimeZoneOffset(date)})`;
}

/**
 * 站内展示用的相对时间
 *
 * 1 分钟内 → 刚刚；1 小时内 → N分钟前；当天 → 今天14:32；
 * 前一天 → 昨天14:32；同年 → 10月29日 14:32；跨年 → 2026年10月29日 14:32
 */
export function formatSmartTime(input?: string | number | Date | null, now: Date = new Date()): string {
  const date = parseServerTime(input);
  if (!date) return '';

  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  // 服务端时钟略快时 diff 为负，按"刚刚"处理，别显示 "-1分钟前"
  if (diffSeconds < 60) return '刚刚';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分钟前`;

  const target = localParts(date);
  const today = localParts(now);
  const hhmm = `${pad(target.hour)}:${pad(target.minute)}`;

  if (isSameDay(target, today)) return `今天${hhmm}`;
  if (isSameDay(target, previousDay(today))) return `昨天${hhmm}`;
  if (target.year === today.year) return `${pad(target.month)}月${pad(target.day)}日 ${hhmm}`;
  return `${target.year}年${pad(target.month)}月${pad(target.day)}日 ${hhmm}`;
}

/** 按时间倒序比较（最新在前），解析失败的值排到最后而不是产生 NaN */
export function compareTimeDesc(a?: string | null, b?: string | null): number {
  const left = parseServerTime(a);
  const right = parseServerTime(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return right.getTime() - left.getTime();
}

/**
 * 判断某个时刻是否落在「每天 startHour ~ endHour」窗口内（左闭右开，支持跨零点）
 *
 * @example isInDailyWindow(23, 6) // 当地 23:30 → true；12:00 → false
 */
export function isInDailyWindow(startHour: number, endHour: number, date: Date = new Date()): boolean {
  // 起止相同表示全天开放，否则这个窗口永远为空，容易被误用成"关闭"
  if (startHour === endHour) return true;
  const {hour} = localParts(date);
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

/**
 * 距离窗口结束（endHour 整点）还有多少秒
 *
 * 正好站在 endHour 整点时返回 24 小时——那一刻窗口已结束（左闭右开），下一次在明天。
 */
export function secondsUntilDailyWindowEnd(endHour: number, date: Date = new Date()): number {
  const {hour, minute, second} = localParts(date);
  const remain = (endHour - hour) * 3600 - minute * 60 - second;
  return remain > 0 ? remain : remain + 86400;
}

/** 秒数 → `05:32:10` 形式的倒计时文案 */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
