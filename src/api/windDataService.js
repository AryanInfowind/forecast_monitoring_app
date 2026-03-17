import apiClient from './axiosInstance';

const JAN_START_ISO = '2024-01-01T00:00:00Z';
const FEB_START_ISO = '2024-02-01T00:00:00Z';

export const JAN_START_DATE = new Date(JAN_START_ISO);
export const JAN_END_DATE = new Date(new Date(FEB_START_ISO).getTime() - 1);

export function clampToJanuary(date) {
  if (date < JAN_START_DATE) return JAN_START_DATE;
  if (date > JAN_END_DATE) return JAN_END_DATE;
  return date;
}

export async function fetchActuals(publishFromIso, publishToIso) {
  const response = await apiClient.get('/datasets/FUELHH/stream', {
    params: {
      publishDateTimeFrom: publishFromIso,
      publishDateTimeTo: publishToIso,
      fuelType: 'WIND',
    },
  });

  const raw = Array.isArray(response.data)
    ? response.data
    : response.data?.data || [];

  return raw
    .filter(
      (item) =>
        item.dataset === 'FUELHH' &&
        item.fuelType === 'WIND' &&
        item.startTime &&
        item.generation != null,
    )
    .map((item) => ({
      startTime: item.startTime,
      generation: Number(item.generation),
    }));
}

export async function fetchForecasts(publishFromIso, publishToIso) {
  const response = await apiClient.get('/datasets/WINDFOR/stream', {
    params: {
      publishDateTimeFrom: publishFromIso,
      publishDateTimeTo: publishToIso,
    },
  });

  const raw = Array.isArray(response.data)
    ? response.data
    : response.data?.data || [];

  return raw
    .filter(
      (item) =>
        item.dataset === 'WINDFOR' &&
        item.startTime &&
        item.publishTime &&
        item.generation != null,
    )
    .map((item) => ({
      startTime: item.startTime,
      publishTime: item.publishTime,
      generation: Number(item.generation),
    }));
}

export function buildForecastSeriesForHorizon(forecasts, horizonHours) {
  if (!Array.isArray(forecasts) || forecasts.length === 0) {
    return new Map();
  }

  const filtered = forecasts.filter((f) => {
    const start = new Date(f.startTime).getTime();
    const publish = new Date(f.publishTime).getTime();
    const diffHours = (start - publish) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 48;
  });

  const byTarget = new Map();

  filtered.forEach((f) => {
    const startMs = new Date(f.startTime).getTime();
    const publishMs = new Date(f.publishTime).getTime();
    const minPublishMs = startMs - horizonHours * 60 * 60 * 1000;

    if (publishMs > minPublishMs) {
      return;
    }

    const key = f.startTime;
    const existing = byTarget.get(key);
    if (!existing || new Date(existing.publishTime) < new Date(f.publishTime)) {
      byTarget.set(key, f);
    }
  });

  const result = new Map();
  byTarget.forEach((value, key) => {
    result.set(key, value.generation);
  });

  return result;
}

