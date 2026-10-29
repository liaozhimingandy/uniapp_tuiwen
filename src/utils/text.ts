/**
 * 文本与富内容解析
 *
 * 后端的帖子内容有两种形态：
 * - 纯文本：`content.text = "今天天气不错"`
 * - 富文本：长文走 wangEditor，`content.text` 是一段 HTML
 * 列表页只需要一行摘要，所以这里做「去标签 + 保留换行」的降级，
 * 详情页才用 `rich-text` 渲染原始 HTML。
 */
import type {IContent} from '@/types';

/**
 * HTML → 纯文本（列表摘要用）
 *
 * 不是通用 HTML 解析器，只处理站内会遇到的情况：
 * 标签、`&nbsp;` 这类实体、连续空行。
 */
export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    // 换行类标签先转成换行符，否则 <p>a</p><p>b</p> 会粘成 "ab"
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 内容是否像 HTML（有标签才需要 rich-text 渲染） */
export function looksLikeHtml(text?: string | null): boolean {
  return !!text && /<[a-z][\s\S]*>/i.test(text);
}

/**
 * 解析图片字段
 *
 * 后端既有格式是逗号分隔的相对路径串（`/media/a.png,/media/b.png`），
 * 但历史上也出现过 JSON 数组字符串，这里两种都兼容，避免某条老数据把整页搞崩。
 */
export function parseImages(images?: string | string[] | null): string[] {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  const raw = String(images).trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
    } catch {
      // 解析失败就当逗号串处理
    }
  }
  return raw
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 从帖子内容里取正文 */
export function contentText(content?: IContent | null): string {
  const text = content?.text;
  return typeof text === 'string' ? text : '';
}

/** 从帖子内容里取图片列表 */
export function contentImages(content?: IContent | null): string[] {
  const images = content?.images;
  if (typeof images === 'string') return parseImages(images);
  if (Array.isArray(images)) return images.filter((item): item is string => typeof item === 'string');
  return [];
}

/** 计数展示：1000 → 1.0k，10000 → 1.0w */
export function formatCount(value?: number | null): string {
  const count = Number(value || 0);
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}w`;
}

/** 匿名代号（天亮即焚未填昵称时用）：形容词 + 名词 */
const ALIAS_ADJ = ['安静的', '失眠的', '温柔的', 'emo的', '清醒的', '迷路的', '勇敢的', '透明的'];
const ALIAS_NOUN = ['夜猫子', '月亮', '海豚', '路灯', '云朵', '麋鹿', '柠檬', '旅人'];

/** 生成一个随机匿名代号（每次发布随机一次，不落库） */
export function randomAlias(): string {
  const adj = ALIAS_ADJ[Math.floor(Math.random() * ALIAS_ADJ.length)];
  const noun = ALIAS_NOUN[Math.floor(Math.random() * ALIAS_NOUN.length)];
  return `${adj}${noun}`;
}
