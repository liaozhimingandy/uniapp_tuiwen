/**
 * 业务常量（与 Web 端 `src/common/constants.ts` 对齐）
 *
 * 这些值同时被前端展示和后端解析使用，属于**接口契约**的一部分，
 * 不要在页面里散写数字字面量，改口径时只改这里。
 */

/** 可见范围：0 仅自己可见 / 1 公开 */
export const POST_RIGHT = {
  PRIVATE: 0,
  PUBLIC: 1,
} as const;

/** 可见范围下拉文案 */
export const POST_RIGHT_MAP: Record<number, string> = {
  [POST_RIGHT.PRIVATE]: '仅自己可见',
  [POST_RIGHT.PUBLIC]: '公开',
};

/** 情绪编码 → 文案（天亮即焚用） */
export const EMOTIONS: Record<number, string> = {
  1: '失眠',
  2: '委屈',
  3: '心动',
  4: '放空',
  5: '吐槽',
  6: '开心',
  7: '难过',
  8: '孤独',
  9: '焦虑',
  10: '迷茫',
  11: '生气',
  12: '疲惫',
  13: '感动',
  14: '愧疚',
  15: '抱有期待',
};

/** 情绪下拉/标签选项 */
export const EMOTION_OPTIONS = Object.entries(EMOTIONS).map(([value, label]) => ({
  value: Number(value),
  label,
}));

/** 情绪对应的淡色底（深色模式下也会被压暗，因此用低透明度） */
export const EMOTION_BG: Record<number, string> = {
  1: 'rgba(0, 82, 204, 0.10)',
  2: 'rgba(222, 53, 11, 0.10)',
  3: 'rgba(0, 135, 90, 0.10)',
  4: 'rgba(255, 255, 255, 0.06)',
  5: 'rgba(255, 140, 0, 0.10)',
  6: 'rgba(0, 135, 90, 0.10)',
  7: 'rgba(222, 53, 11, 0.10)',
  8: 'rgba(0, 82, 204, 0.10)',
  9: 'rgba(255, 140, 0, 0.10)',
  10: 'rgba(255, 255, 255, 0.06)',
  11: 'rgba(222, 53, 11, 0.10)',
  12: 'rgba(255, 255, 255, 0.06)',
  13: 'rgba(0, 135, 90, 0.10)',
  14: 'rgba(255, 140, 0, 0.10)',
  15: 'rgba(0, 82, 204, 0.10)',
};

/** 天亮即焚开放窗口（本地时间）：23:00 ~ 次日 06:00 */
export const SNAP_OPEN_HOUR = 23;
export const SNAP_BURN_HOUR = 6;

/** 单条心事正文上限 */
export const SNAP_CONTENT_MAX = 1000;

/** 单条帖子正文上限 */
export const POST_CONTENT_MAX = 5000;

/** 单次最多选择的图片数 */
export const MAX_IMAGES = 9;

/** 性别选项 */
export const SEX_OPTIONS = [
  {value: 1, label: '男'},
  {value: 2, label: '女'},
  {value: 0, label: '未知'},
  {value: 9, label: '不愿透露'},
];
