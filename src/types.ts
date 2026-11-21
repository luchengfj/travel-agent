/** Worker 环境绑定与共享类型 */

export interface Env {
  /** Amadeus for Developers 免费 API（自助注册已关停，仅历史账号可用） */
  AMADEUS_CLIENT_ID?: string;
  AMADEUS_CLIENT_SECRET?: string;
  /** Travelpayouts API Token（travelpayouts.com 后台 Profile → API token） */
  TRAVELPAYOUTS_TOKEN?: string;
  /** 可选：OpenAI 兼容 LLM；不填则使用 Workers AI */
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  /** Cloudflare Workers AI 绑定（Node/ALTAR 部署下无此绑定，走 LLM_API_KEY） */
  AI?: Ai;
  /** KV 缓存（可选绑定；未绑定时退化为内存缓存） */
  CACHE?: KVNamespace;
  /** 静态资源绑定（public/；仅 Cloudflare Worker 模式存在） */
  ASSETS?: Fetcher;
}

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 价格卡片条目 */
export interface PriceItem {
  title: string;
  subtitle?: string;
  price?: string;
  tags?: string[];
  /** 预订/查询链接（如 Aviasales 联盟链接） */
  url?: string;
}

/** 报价来源 */
export type PriceSource = 'amadeus' | 'travelpayouts' | 'wikivoyage' | '12306' | 'estimate' | 'none';

/** SSE 事件（前端按 type 渲染） */
export type SSEEvent =
  | { type: 'step'; id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
  | { type: 'prices'; category: string; title: string; source: PriceSource; note?: string; items: PriceItem[] }
  | { type: 'question'; text: string }
  | { type: 'itinerary'; markdown: string }
  | { type: 'itinerary_json'; plan: TripPlan }
  | { type: 'weather'; items: import('./weather.ts').WeatherDay[] }
  | { type: 'currency'; currency: string; symbol: string; ratePerCny: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** 结构化行程（攻略图数据源） */
export interface PlanSegment {
  time: string; // "09:00-12:30"
  title: string;
  type?: string; // transport | sight | food | hotel | shopping | rest
  place?: string;
  lat?: number;
  lng?: number;
  transport?: string;
  cost?: string;
  price_ref?: PriceSource;
  note?: string;
}

export interface PlanDay {
  day: number;
  date?: string;
  theme?: string;
  segments: PlanSegment[];
}

export interface PlanPriceRow {
  category: string;
  option?: string;
  price?: string;
  source?: string;
}

export interface TripPlan {
  title: string;
  summary?: string;
  origin?: { city?: string; iata?: string; train_code?: string };
  destination?: { city?: string; iata?: string; train_code?: string };
  depart_date?: string;
  return_date?: string | null;
  nights?: number;
  travelers?: number;
  budget_cny?: number | null;
  estimated_total?: { min?: number; max?: number; currency?: string; note?: string };
  days: PlanDay[];
  price_summary?: PlanPriceRow[];
  tips?: string[];
  /** 行前打包清单（LLM 按目的地/天数/天气生成） */
  packing?: string[];
}
