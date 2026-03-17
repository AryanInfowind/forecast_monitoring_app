# Forecast monitoring app

This app visualises national-level UK wind power generation, comparing **actual** generation with **forecasted** generation from the Elexon BMRS APIs.

- **Actuals (blue line)**: `FUELHH` dataset, `fuelType=WIND`.
- **Forecasts (green line)**: `WINDFOR` dataset.
- **Time window**: only data for **January 2024** is used.
- **Forecast horizon**: user-selectable **0–48 hours**; for each target time the app shows the latest forecast created at least _H_ hours before that time.

## Running the app

- Install dependencies:

```bash
npm install
```

- Start the development server:

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

## UI and interaction

- **Start Time / End Time**: MUI date-time pickers that select the target-time window; they are clamped to the range `2024-01-01 00:00` to `2024-01-31 23:59` (UTC).
- **Forecast Horizon slider**: selects horizon `H` between 0 and 48 hours.
  - For each half-hour target time in the window, the app finds the latest `WINDFOR` forecast whose `publishTime` is at least `H` hours before the target, with `0 ≤ horizon ≤ 48`.
- **Chart**: MUI X `LineChart` showing:
  - Blue line: actual generation from `FUELHH` (MW).
  - Green line: horizon-specific forecast generation from `WINDFOR` (MW).

## Analysis script (January 2024)

The project includes a simple Node script that computes basic forecast accuracy metrics for January 2024.

- File: `analysis/jan2024Analysis.js`
- It:
  - Fetches January 2024 data from `FUELHH` (actuals) and `WINDFOR` (forecasts).
  - Builds aligned actual vs forecast pairs for horizons **4h** and **24h**.
  - Prints **MAE**, **RMSE**, and **bias** (mean error) for each horizon.

### Running the analysis

From the project root:

```bash
node analysis/jan2024Analysis.js
```

You will see metrics for the configured horizons printed to the console.
