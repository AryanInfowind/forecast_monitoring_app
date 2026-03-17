// Simple Node script to compute basic forecast accuracy metrics
// for January 2024 using the same BMRS endpoints as the app.
//
// Usage:
//   node analysis/jan2024Analysis.js

/* eslint-disable no-console */

import axios from 'axios';

const client = axios.create({
  baseURL: 'https://data.elexon.co.uk/bmrs/api/v1',
  headers: {
    Accept: 'text/plain',
  },
  timeout: 60000,
});

const JAN_START = new Date('2024-01-01T00:00:00Z');
const FEB_START = new Date('2024-02-01T00:00:00Z');

async function fetchActuals(publishFromIso, publishToIso) {
  const res = await client.get('/datasets/FUELHH/stream', {
    params: {
      publishDateTimeFrom: publishFromIso,
      publishDateTimeTo: publishToIso,
      fuelType: 'WIND',
    },
  });

  const raw = Array.isArray(res.data) ? res.data : res.data?.data || [];

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

async function fetchForecasts(publishFromIso, publishToIso) {
  const res = await client.get('/datasets/WINDFOR/stream', {
    params: {
      publishDateTimeFrom: publishFromIso,
      publishDateTimeTo: publishToIso,
    },
  });

  const raw = Array.isArray(res.data) ? res.data : res.data?.data || [];

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

function buildForecastSeriesForHorizon(forecasts, horizonHours) {
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

function computeMetrics(pairs) {
  const n = pairs.length;
  if (!n) return null;

  let sumAbs = 0;
  let sumSq = 0;
  let sumErr = 0;

  pairs.forEach(({ actual, forecast }) => {
    const err = forecast - actual;
    sumAbs += Math.abs(err);
    sumSq += err * err;
    sumErr += err;
  });

  const mae = sumAbs / n;
  const rmse = Math.sqrt(sumSq / n);
  const bias = sumErr / n;

  return { n, mae, rmse, bias };
}

async function main() {
  console.log('Fetching January 2024 data ...');

  const publishFromIso = JAN_START.toISOString();
  const publishToIso = FEB_START.toISOString();

  const [actuals, forecasts] = await Promise.all([
    fetchActuals(publishFromIso, publishToIso),
    fetchForecasts(publishFromIso, publishToIso),
  ]);

  const horizons = [4, 24];

  horizons.forEach((h) => {
    const forecastSeries = buildForecastSeriesForHorizon(forecasts, h);

    const pairs = actuals
      .filter((a) => forecastSeries.has(a.startTime))
      .map((a) => ({
        time: a.startTime,
        actual: a.generation,
        forecast: forecastSeries.get(a.startTime),
      }));

    const metrics = computeMetrics(pairs);
    if (!metrics) {
      console.log(`No overlapping data for horizon ${h}h`);
      return;
    }

    console.log(`\nHorizon ${h}h:`);
    console.log(`Points: ${metrics.n}`);
    console.log(`MAE (MW): ${metrics.mae.toFixed(2)}`);
    console.log(`RMSE (MW): ${metrics.rmse.toFixed(2)}`);
    console.log(`Bias (MW): ${metrics.bias.toFixed(2)}`);
  });
}

main().catch((err) => {
  console.error('Analysis failed', err.message || err);
  process.exit(1);
});

