/**
 * 天气预报：Open-Meteo 免费开放接口（无需 Key）。
 * 仅当出发日期在预报窗口内（约16天）时返回真实逐日预报；超出窗口返回 null。
 */
import type { Env } from './types.ts';

export interface WeatherDay {
  date: string;
  min: number;
  max: number;
  desc: string;
  precip: number; // 降水概率 %
}

const WMO: Record<number, string> = {
  0: '晴', 1: '基本晴', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴冰雹',
};

function wmoDesc(code?: number): string {
  return WMO[code ?? -1] ?? '—';
}

function addDays(dateStr: string, n: number): string {
  return new Date(Date.parse(dateStr) + n * 86_400_000).toISOString().slice(0, 10);
}

export async function fetchWeather(
  env: Env,
  lat: number,
  lng: number,
  startDate: string,
  days: number,
): Promise<WeatherDay[] | null> {
  const today = new Date().toISOString().slice(0, 10);
  const maxStart = addDays(today, 16);
  if (startDate < today || startDate > maxStart) return null; // 过去或超出预报窗口
  const tripDays = Math.max(1, Math.min(7, days));
  const endDate = addDays(startDate, tripDays - 1);

  const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}:${startDate}:${tripDays}`;
  try {
    if (env.CACHE) {
      const raw = await env.CACHE.get(key);
      if (raw) return JSON.parse(raw) as WeatherDay[];
    }
  } catch {
    // KV 不可用
  }

  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lng));
  u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  u.searchParams.set('timezone', 'auto');
  u.searchParams.set('start_date', startDate);
  u.searchParams.set('end_date', endDate);

  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: (number | null)[];
      };
    };
    const d = j.daily;
    if (!d?.time?.length) return null;
    const out: WeatherDay[] = d.time.map((date, i) => ({
      date,
      max: Math.round(d.temperature_2m_max?.[i] ?? 0),
      min: Math.round(d.temperature_2m_min?.[i] ?? 0),
      desc: wmoDesc(d.weather_code?.[i]),
      precip: d.precipitation_probability_max?.[i] ?? 0,
    }));
    try {
      if (env.CACHE) {
        await env.CACHE.put(key, JSON.stringify(out), { expirationTtl: 10_800 }); // 3h
      }
    } catch {
      // 忽略
    }
    return out;
  } catch {
    return null;
  }
}
