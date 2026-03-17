import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { Box, Grid, Slider, Typography, Paper, CircularProgress } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  JAN_START_DATE,
  JAN_END_DATE,
  clampToJanuary,
  fetchActuals,
  fetchForecasts,
  buildForecastSeriesForHorizon,
} from '../api/windDataService';
import '../styles/forecastMonitoring.css';

function ForecastMonitoring() {
  const [startTime, setStartTime] = useState(new Date('2024-01-01T00:00:00Z'));
  const [endTime, setEndTime] = useState(new Date('2024-01-02T00:00:00Z'));
  const [horizon, setHorizon] = useState(4);
  const [forecastData, setForecastData] = useState([]);
  const [actualData, setActualData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastRequestKeyRef = useRef('');
  const cacheRef = useRef(new Map());

  useEffect(() => {
    let isCancelled = false;
    const clampedStart = clampToJanuary(startTime);
    const clampedEnd = clampToJanuary(endTime);

    const targetFromIso = clampedStart.toISOString();
    const targetToIso = clampedEnd.toISOString();

    // Forecasts may be published up to 48h before target times
    const forecastPublishFromIso = new Date(
      clampedStart.getTime() - 48 * 60 * 60 * 1000,
    ).toISOString();
    const forecastPublishToIso = targetToIso;

    const requestKey = `${targetFromIso}|${targetToIso}|${forecastPublishFromIso}|${forecastPublishToIso}`;

    // Avoid duplicate calls (e.g., React StrictMode double effect)
    if (lastRequestKeyRef.current === requestKey) {
      return undefined;
    }
    lastRequestKeyRef.current = requestKey;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const cacheKey = requestKey;
        if (cacheRef.current.has(cacheKey)) {
          const cached = cacheRef.current.get(cacheKey);
          setForecastData(cached.forecasts);
          setActualData(cached.actuals);
          return;
        }

        const [forecasts, actuals] = await Promise.all([
          fetchForecasts(forecastPublishFromIso, forecastPublishToIso),
          fetchActuals(targetFromIso, targetToIso),
        ]);

        if (isCancelled) return;

        cacheRef.current.set(cacheKey, {
          forecasts,
          actuals,
        });

        setForecastData(forecasts);
        setActualData(actuals);
      } catch (e) {
        if (!isCancelled) {
          setError('Failed to load data from API.');
          setForecastData([]);
          setActualData([]);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [startTime, endTime]);

  const forecastByHorizon = useMemo(
    () => buildForecastSeriesForHorizon(forecastData, horizon),
    [forecastData, horizon],
  );

  const timeAxis = useMemo(() => {
    const from = clampToJanuary(startTime).getTime();
    const to = clampToJanuary(endTime).getTime();

    // Per spec: build axis from target times present in actuals
    const times = actualData
      .map((p) => p.startTime)
      .filter(Boolean)
      .filter((t) => {
        const ms = new Date(t).getTime();
        return ms >= from && ms <= to;
      })
      .sort((a, b) => new Date(a) - new Date(b));

    // Deduplicate to avoid repeated x values across days
    return Array.from(new Set(times));
  }, [actualData, startTime, endTime]);

  const forecastPoints = useMemo(() => {
    const points = Array.from(forecastByHorizon.entries())
      .map(([startTimeIso, generation]) => ({
        t: new Date(startTimeIso).getTime(),
        generation,
      }))
      .filter((p) => Number.isFinite(p.t) && p.generation != null)
      .sort((a, b) => a.t - b.t);

    return points;
  }, [forecastByHorizon]);

  const forecastSeriesValues = useMemo(() => {
    // Fill short gaps so forecast draws as a proper line even if WINDFOR is hourly.
    // Only forward-fill within 60 minutes; otherwise treat as missing.
    const maxGapMs = 60 * 60 * 1000;

    let idx = 0;
    let last = null;

    return timeAxis.map((iso) => {
      const targetMs = new Date(iso).getTime();

      while (idx < forecastPoints.length && forecastPoints[idx].t <= targetMs) {
        last = forecastPoints[idx];
        idx += 1;
      }

      if (!last) return null;
      if (targetMs - last.t > maxGapMs) return null;
      return last.generation;
    });
  }, [timeAxis, forecastPoints]);

  const timeAxisDates = useMemo(
    () => timeAxis.map((t) => new Date(t)),
    [timeAxis],
  );

  const xTickFormatter = useMemo(() => {
    const from = clampToJanuary(startTime).getTime();
    const to = clampToJanuary(endTime).getTime();
    const multiDay = to - from > 24 * 60 * 60 * 1000;

    const fmtTime = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });

    const fmtDateTime = new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });

    return (value) => (multiDay ? fmtDateTime.format(value) : fmtTime.format(value));
  }, [startTime, endTime]);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box className="forecast-root">
        <Typography variant="h5" className="forecast-title">
          Forecast monitoring app
        </Typography>

        <Paper className="forecast-controls" elevation={2}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" gutterBottom>
                Start Time
              </Typography>
              <DateTimePicker
                value={startTime}
                minDateTime={JAN_START_DATE}
                maxDateTime={JAN_END_DATE}
                onChange={(value) => value && setStartTime(clampToJanuary(value))}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" gutterBottom>
                End Time
              </Typography>
              <DateTimePicker
                value={endTime}
                minDateTime={JAN_START_DATE}
                maxDateTime={JAN_END_DATE}
                onChange={(value) => value && setEndTime(clampToJanuary(value))}
                slotProps={{ textField: { size: 'small', fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" gutterBottom>
                Forecast Horizon: {horizon}h
              </Typography>
              <Slider
                min={0}
                max={48}
                step={1}
                value={horizon}
                onChange={(_, v) => setHorizon(v)}
                valueLabelDisplay="auto"
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper className="forecast-chart-container" elevation={2}>
          <Typography variant="subtitle2" className="forecast-chart-title">
            Power forecast vs actual
          </Typography>
          {error && (
            <Typography color="error" variant="caption">
              {error}
            </Typography>
          )}
          {loading && (
            <Box display="flex" justifyContent="center" my={2}>
              <CircularProgress size={24} />
            </Box>
          )}
          <LineChart
            className="forecast-chart"
            xAxis={[
              {
                scaleType: 'time',
                data: timeAxisDates,
                label: 'Target Time End (UTC)',
                valueFormatter: xTickFormatter,
              },
            ]}
            yAxis={[
              {
                label: 'Power (k)',
                valueFormatter: (v) =>
                  v == null ? '' : `${Math.round(Number(v) / 1000)}k`,
              },
            ]}
            series={[
              {
                data: forecastSeriesValues,
                label: 'Forecast',
                color: '#2e7d32',
                curve: 'monotoneX',
                showMark: false,
              },
              {
                data: timeAxis.map((t) => {
                  const found = actualData.find((p) => p.startTime === t);
                  return found ? found.generation : null;
                }),
                label: 'Actual',
                color: '#1976d2',
                curve: 'monotoneX',
                showMark: false,
              },
            ]}
            height={360}
          />
        </Paper>
      </Box>
    </LocalizationProvider>
  );
}

export default ForecastMonitoring;

