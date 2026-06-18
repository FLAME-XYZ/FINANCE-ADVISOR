/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — indicators.js  (v3.0)
   Library kalkulasi indikator teknikal MURNI JavaScript
   Input : array OHLCV [{time, open, high, low, close, volume}]
   Output: array nilai indikator (NaN untuk nilai awal)
   Expose: window.Indicators = { ... }
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     HELPER INTERNAL
  ───────────────────────────────────────────── */
  function _fill(n, val = NaN) { return Array(n).fill(val); }

  function _sum(arr, i, period) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j];
    return s;
  }

  function _mean(arr, i, period) { return _sum(arr, i, period) / period; }

  function _stddev(arr, i, period) {
    const mean = _mean(arr, i, period);
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (arr[j] - mean) ** 2;
    return Math.sqrt(variance / period);
  }

  /* ═══════════════════════════════════════════════════════
     1. TREND — SMA
  ═══════════════════════════════════════════════════════ */
  function calcSMA(closes, period) {
    const n   = closes.length;
    const out = _fill(n);
    for (let i = period - 1; i < n; i++) out[i] = _mean(closes, i, period);
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     2. TREND — EMA
  ═══════════════════════════════════════════════════════ */
  function calcEMA(closes, period) {
    const n   = closes.length;
    const out = _fill(n);
    const k   = 2 / (period + 1);
    // Seed dengan SMA pertama
    let seed = 0;
    for (let i = 0; i < period; i++) seed += closes[i];
    out[period - 1] = seed / period;
    for (let i = period; i < n; i++) {
      out[i] = closes[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     3. TREND — MACD
  ═══════════════════════════════════════════════════════ */
  function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    const n       = closes.length;
    const emaFast = calcEMA(closes, fast);
    const emaSlow = calcEMA(closes, slow);
    const macd    = _fill(n);
    const sig     = _fill(n);
    const hist    = _fill(n);

    for (let i = slow - 1; i < n; i++) {
      macd[i] = emaFast[i] - emaSlow[i];
    }

    // Signal EMA dari MACD
    const k     = 2 / (signal + 1);
    const start = slow - 1 + signal - 1;
    // Seed signal
    let seedSum = 0;
    for (let i = slow - 1; i < slow - 1 + signal; i++) seedSum += (isNaN(macd[i]) ? 0 : macd[i]);
    sig[start] = seedSum / signal;
    for (let i = start + 1; i < n; i++) {
      if (!isNaN(macd[i])) sig[i] = macd[i] * k + sig[i - 1] * (1 - k);
    }
    for (let i = 0; i < n; i++) {
      if (!isNaN(macd[i]) && !isNaN(sig[i])) hist[i] = macd[i] - sig[i];
    }
    return { macd, signal: sig, histogram: hist };
  }

  /* ═══════════════════════════════════════════════════════
     4. TREND — BOLLINGER BANDS
  ═══════════════════════════════════════════════════════ */
  function calcBollingerBands(closes, period = 20, stdDevMult = 2) {
    const n      = closes.length;
    const upper  = _fill(n);
    const middle = _fill(n);
    const lower  = _fill(n);
    const width  = _fill(n);

    for (let i = period - 1; i < n; i++) {
      const avg = _mean(closes, i, period);
      const sd  = _stddev(closes, i, period);
      middle[i] = avg;
      upper[i]  = avg + stdDevMult * sd;
      lower[i]  = avg - stdDevMult * sd;
      width[i]  = avg > 0 ? ((upper[i] - lower[i]) / avg) * 100 : 0;
    }
    return { upper, middle, lower, width };
  }

  /* ═══════════════════════════════════════════════════════
     5. TREND — PARABOLIC SAR
  ═══════════════════════════════════════════════════════ */
  function calcParabolicSAR(highs, lows, step = 0.02, max = 0.2) {
    const n     = highs.length;
    const sar   = _fill(n);
    const trend = _fill(n, null);
    if (n < 2) return { sar, trend };

    let isUpTrend = true;
    let af        = step;
    let ep        = highs[0]; // extreme point
    let psarVal   = lows[0];

    for (let i = 1; i < n; i++) {
      const prevSar = psarVal;

      if (isUpTrend) {
        psarVal = prevSar + af * (ep - prevSar);
        psarVal = Math.min(psarVal, lows[i - 1], i > 1 ? lows[i - 2] : lows[i - 1]);

        if (lows[i] < psarVal) {
          // Reversal ke downtrend
          isUpTrend = false;
          psarVal   = ep;
          ep        = lows[i];
          af        = step;
        } else {
          if (highs[i] > ep) {
            ep = highs[i];
            af = Math.min(af + step, max);
          }
        }
      } else {
        psarVal = prevSar - af * (prevSar - ep);
        psarVal = Math.max(psarVal, highs[i - 1], i > 1 ? highs[i - 2] : highs[i - 1]);

        if (highs[i] > psarVal) {
          // Reversal ke uptrend
          isUpTrend = true;
          psarVal   = ep;
          ep        = highs[i];
          af        = step;
        } else {
          if (lows[i] < ep) {
            ep = lows[i];
            af = Math.min(af + step, max);
          }
        }
      }

      sar[i]   = psarVal;
      trend[i] = isUpTrend ? 'up' : 'down';
    }
    return { sar, trend };
  }

  /* ═══════════════════════════════════════════════════════
     6. TREND — ICHIMOKU CLOUD
  ═══════════════════════════════════════════════════════ */
  function calcIchimoku(highs, lows, closes, tenkan = 9, kijun = 26, senkou = 52) {
    const n        = highs.length;
    const tenkanArr  = _fill(n);
    const kijunArr   = _fill(n);
    const senkouAArr = _fill(n);
    const senkouBArr = _fill(n);
    const chikouArr  = _fill(n);

    function midpoint(arr1, arr2, i, period) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (arr1[j] > hi) hi = arr1[j];
        if (arr2[j] < lo) lo = arr2[j];
      }
      return (hi + lo) / 2;
    }

    for (let i = 0; i < n; i++) {
      if (i >= tenkan - 1) tenkanArr[i] = midpoint(highs, lows, i, tenkan);
      if (i >= kijun - 1)  kijunArr[i]  = midpoint(highs, lows, i, kijun);
      // Senkou A & B diplot 26 candle ke depan, kita taruh di posisi sekarang
      if (i >= kijun - 1 && !isNaN(tenkanArr[i]) && !isNaN(kijunArr[i]))
        senkouAArr[i] = (tenkanArr[i] + kijunArr[i]) / 2;
      if (i >= senkou - 1) senkouBArr[i] = midpoint(highs, lows, i, senkou);
      // Chikou: close diplot 26 candle ke belakang
      if (i + kijun < n) chikouArr[i] = closes[i + kijun];
    }
    return {
      tenkan:  tenkanArr,
      kijun:   kijunArr,
      senkouA: senkouAArr,
      senkouB: senkouBArr,
      chikou:  chikouArr,
    };
  }

  /* ═══════════════════════════════════════════════════════
     7. MOMENTUM — RSI
  ═══════════════════════════════════════════════════════ */
  function calcRSI(closes, period = 14) {
    const n   = closes.length;
    const out = _fill(n);
    if (n < period + 1) return out;

    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gainSum += diff;
      else           lossSum -= diff;
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff <  0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     8. MOMENTUM — STOCHASTIC
  ═══════════════════════════════════════════════════════ */
  function calcStochastic(highs, lows, closes, k = 14, d = 3, smooth = 3) {
    const n    = closes.length;
    const rawK = _fill(n);
    const outK = _fill(n);
    const outD = _fill(n);

    for (let i = k - 1; i < n; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - k + 1; j <= i; j++) {
        if (highs[j] > hi) hi = highs[j];
        if (lows[j]  < lo) lo = lows[j];
      }
      rawK[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
    }

    // Smooth %K
    for (let i = k + smooth - 2; i < n; i++) {
      let s = 0, cnt = 0;
      for (let j = i - smooth + 1; j <= i; j++) {
        if (!isNaN(rawK[j])) { s += rawK[j]; cnt++; }
      }
      if (cnt === smooth) outK[i] = s / smooth;
    }

    // %D = SMA of smoothed %K
    for (let i = k + smooth + d - 3; i < n; i++) {
      let s = 0, cnt = 0;
      for (let j = i - d + 1; j <= i; j++) {
        if (!isNaN(outK[j])) { s += outK[j]; cnt++; }
      }
      if (cnt === d) outD[i] = s / d;
    }
    return { k: outK, d: outD };
  }

  /* ═══════════════════════════════════════════════════════
     9. MOMENTUM — WILLIAMS %R
  ═══════════════════════════════════════════════════════ */
  function calcWilliamsR(highs, lows, closes, period = 14) {
    const n   = closes.length;
    const out = _fill(n);
    for (let i = period - 1; i < n; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (highs[j] > hi) hi = highs[j];
        if (lows[j]  < lo) lo = lows[j];
      }
      out[i] = hi === lo ? -50 : ((hi - closes[i]) / (hi - lo)) * -100;
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     10. MOMENTUM — CCI (Commodity Channel Index)
  ═══════════════════════════════════════════════════════ */
  function calcCCI(highs, lows, closes, period = 20) {
    const n   = closes.length;
    const out = _fill(n);
    for (let i = period - 1; i < n; i++) {
      let tpSum = 0;
      const tpArr = [];
      for (let j = i - period + 1; j <= i; j++) {
        const tp = (highs[j] + lows[j] + closes[j]) / 3;
        tpSum += tp;
        tpArr.push(tp);
      }
      const tpMean = tpSum / period;
      let madSum   = 0;
      tpArr.forEach(tp => { madSum += Math.abs(tp - tpMean); });
      const mad  = madSum / period;
      const tp0  = (highs[i] + lows[i] + closes[i]) / 3;
      out[i] = mad === 0 ? 0 : (tp0 - tpMean) / (0.015 * mad);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     11. MOMENTUM — MOMENTUM INDICATOR
  ═══════════════════════════════════════════════════════ */
  function calcMomentum(closes, period = 10) {
    const n   = closes.length;
    const out = _fill(n);
    for (let i = period; i < n; i++) {
      out[i] = closes[i] - closes[i - period];
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     12. VOLUME — OBV (On Balance Volume)
  ═══════════════════════════════════════════════════════ */
  function calcOBV(closes, volumes) {
    const n   = closes.length;
    const out = _fill(n);
    out[0]    = volumes[0];
    for (let i = 1; i < n; i++) {
      if (closes[i] > closes[i - 1])      out[i] = out[i - 1] + volumes[i];
      else if (closes[i] < closes[i - 1]) out[i] = out[i - 1] - volumes[i];
      else                                 out[i] = out[i - 1];
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     13. VOLUME — Volume EMA
  ═══════════════════════════════════════════════════════ */
  function calcVolumeEMA(volumes, period = 20) {
    return calcEMA(volumes, period);
  }

  /* ═══════════════════════════════════════════════════════
     14. VOLATILITY — ATR (Average True Range)
  ═══════════════════════════════════════════════════════ */
  function calcATR(highs, lows, closes, period = 14) {
    const n   = closes.length;
    const out = _fill(n);
    const tr  = _fill(n);

    tr[0] = highs[0] - lows[0];
    for (let i = 1; i < n; i++) {
      tr[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i]  - closes[i - 1])
      );
    }

    // Seed ATR dengan SMA
    let seed = 0;
    for (let i = 0; i < period; i++) seed += tr[i];
    out[period - 1] = seed / period;

    // Wilder's smoothing
    for (let i = period; i < n; i++) {
      out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     15. VOLATILITY — Standard Deviation
  ═══════════════════════════════════════════════════════ */
  function calcStdDev(closes, period = 20) {
    const n   = closes.length;
    const out = _fill(n);
    for (let i = period - 1; i < n; i++) out[i] = _stddev(closes, i, period);
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     16. SUPPORT & RESISTANCE — Pivot Points
  ═══════════════════════════════════════════════════════ */
  function calcPivotPoints(high, low, close) {
    const pp = (high + low + close) / 3;

    const classic = {
      pp,
      r1: 2 * pp - low,
      r2: pp + (high - low),
      r3: high + 2 * (pp - low),
      s1: 2 * pp - high,
      s2: pp - (high - low),
      s3: low - 2 * (high - pp),
    };

    const fibonacci = {
      pp,
      r1: pp + 0.382 * (high - low),
      r2: pp + 0.618 * (high - low),
      r3: pp + 1.000 * (high - low),
      s1: pp - 0.382 * (high - low),
      s2: pp - 0.618 * (high - low),
      s3: pp - 1.000 * (high - low),
    };

    const camarilla = {
      pp,
      r1: close + (high - low) * 1.1 / 12,
      r2: close + (high - low) * 1.1 / 6,
      r3: close + (high - low) * 1.1 / 4,
      s1: close - (high - low) * 1.1 / 12,
      s2: close - (high - low) * 1.1 / 6,
      s3: close - (high - low) * 1.1 / 4,
    };

    const wpp = (high + low + 2 * close) / 4;
    const woodie = {
      pp: wpp,
      r1: 2 * wpp - low,
      r2: wpp + high - low,
      r3: high + 2 * (wpp - low),
      s1: 2 * wpp - high,
      s2: wpp - high + low,
      s3: low - 2 * (high - wpp),
    };

    return { classic, fibonacci, camarilla, woodie };
  }

  /* ═══════════════════════════════════════════════════════
     17. SUPPORT & RESISTANCE — Swing High / Low
  ═══════════════════════════════════════════════════════ */
  function findSwingHighLow(highs, lows, lookback = 5) {
    const n          = highs.length;
    const swingHighs = [];
    const swingLows  = [];

    for (let i = lookback; i < n - lookback; i++) {
      // Swing High: lebih tinggi dari semua tetangga kiri & kanan
      let isSwingHigh = true;
      let isSwingLow  = true;
      for (let j = 1; j <= lookback; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isSwingHigh = false;
        if (lows[i]  >= lows[i - j]  || lows[i]  >= lows[i + j])  isSwingLow  = false;
      }
      if (isSwingHigh) swingHighs.push({ index: i, price: highs[i] });
      if (isSwingLow)  swingLows.push ({ index: i, price: lows[i]  });
    }
    return { swingHighs, swingLows };
  }

  /* ═══════════════════════════════════════════════════════
     18. SUPPORT & RESISTANCE — Key Levels (cluster analisis)
  ═══════════════════════════════════════════════════════ */
  function findKeyLevels(ohlcv, minTouches = 2) {
    const n      = ohlcv.length;
    const highs  = ohlcv.map(c => c.high);
    const lows   = ohlcv.map(c => c.low);
    const closes = ohlcv.map(c => c.close);

    const { swingHighs, swingLows } = findSwingHighLow(highs, lows, 5);
    const tolerance = (Math.max(...closes) - Math.min(...closes)) * 0.005;

    function cluster(points) {
      const groups = [];
      points.forEach(p => {
        const existing = groups.find(g => Math.abs(g.price - p.price) <= tolerance);
        if (existing) {
          existing.touches++;
          existing.price = (existing.price + p.price) / 2;
        } else {
          groups.push({ price: p.price, touches: 1 });
        }
      });
      return groups.filter(g => g.touches >= minTouches).sort((a, b) => b.touches - a.touches);
    }

    const supports    = cluster(swingLows);
    const resistances = cluster(swingHighs);
    return { supports, resistances };
  }

  /* ═══════════════════════════════════════════════════════
     19. SIGNAL GENERATOR — getSignals(ohlcv)
  ═══════════════════════════════════════════════════════ */
  function getSignals(ohlcv) {
    if (!ohlcv || ohlcv.length < 30) {
      return {
        rsi:     { value: null, signal: 'NEUTRAL' },
        macd:    { value: null, signal: 'NEUTRAL' },
        ma:      { value: null, signal: 'NEUTRAL' },
        bb:      { value: null, signal: 'NEUTRAL' },
        stoch:   { value: null, signal: 'NEUTRAL' },
        overall: { score: 0, direction: 'NEUTRAL' },
      };
    }

    const closes  = ohlcv.map(c => c.close);
    const highs   = ohlcv.map(c => c.high);
    const lows    = ohlcv.map(c => c.low);
    const volumes = ohlcv.map(c => c.volume);
    const last    = closes.length - 1;
    const price   = closes[last];

    /* ── RSI ── */
    const rsiArr   = calcRSI(closes, 14);
    const rsiVal   = rsiArr[last];
    let   rsiSig   = 'NEUTRAL';
    if (!isNaN(rsiVal)) {
      if (rsiVal < 30)      rsiSig = 'BUY';
      else if (rsiVal > 70) rsiSig = 'SELL';
    }

    /* ── MACD ── */
    const macdRes  = calcMACD(closes, 12, 26, 9);
    const macdVal  = macdRes.histogram[last];
    const macdPrev = macdRes.histogram[last - 1];
    let   macdSig  = 'NEUTRAL';
    if (!isNaN(macdVal) && !isNaN(macdPrev)) {
      if (macdVal > 0 && macdVal > macdPrev) macdSig = 'BUY';
      else if (macdVal < 0 && macdVal < macdPrev) macdSig = 'SELL';
    }

    /* ── MA Cross ── */
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    const e20  = ema20[last], e50  = ema50[last], e200 = ema200[last];
    let   maSig = 'NEUTRAL';
    if (!isNaN(e20) && !isNaN(e50)) {
      const bullish = price > e20 && price > e50 && (!isNaN(e200) ? price > e200 : true);
      const bearish = price < e20 && price < e50 && (!isNaN(e200) ? price < e200 : true);
      if (bullish)       maSig = 'BUY';
      else if (bearish)  maSig = 'SELL';
    }

    /* ── Bollinger Bands ── */
    const bbRes  = calcBollingerBands(closes, 20, 2);
    const bbUpper = bbRes.upper[last], bbLower = bbRes.lower[last];
    let   bbSig   = 'NEUTRAL';
    if (!isNaN(bbLower) && !isNaN(bbUpper)) {
      if (price <= bbLower)      bbSig = 'BUY';
      else if (price >= bbUpper) bbSig = 'SELL';
    }

    /* ── Stochastic ── */
    const stochRes = calcStochastic(highs, lows, closes, 14, 3, 3);
    const stochK   = stochRes.k[last];
    const stochD   = stochRes.d[last];
    let   stochSig = 'NEUTRAL';
    if (!isNaN(stochK)) {
      if (stochK < 20 && (!isNaN(stochD) ? stochK > stochD : true)) stochSig = 'BUY';
      else if (stochK > 80 && (!isNaN(stochD) ? stochK < stochD : true)) stochSig = 'SELL';
    }

    /* ── Overall Score ── */
    const weights = { rsi: 20, macd: 25, ma: 25, bb: 15, stoch: 15 };
    const sigToScore = { BUY: 1, NEUTRAL: 0, SELL: -1 };
    let   totalScore = 0, totalWeight = 0;
    [
      { sig: rsiSig,   w: weights.rsi   },
      { sig: macdSig,  w: weights.macd  },
      { sig: maSig,    w: weights.ma    },
      { sig: bbSig,    w: weights.bb    },
      { sig: stochSig, w: weights.stoch },
    ].forEach(({ sig, w }) => {
      totalScore  += sigToScore[sig] * w;
      totalWeight += w;
    });

    const score = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    let direction = 'NEUTRAL';
    if      (score >= 60)  direction = 'STRONG BUY';
    else if (score >= 20)  direction = 'BUY';
    else if (score <= -60) direction = 'STRONG SELL';
    else if (score <= -20) direction = 'SELL';

    return {
      rsi:     { value: isNaN(rsiVal) ? null : +rsiVal.toFixed(2),    signal: rsiSig   },
      macd:    { value: isNaN(macdVal) ? null : +macdVal.toFixed(6),  signal: macdSig  },
      ma:      { value: isNaN(e20) ? null : +e20.toFixed(5),          signal: maSig    },
      bb:      { value: isNaN(bbRes.width[last]) ? null : +bbRes.width[last].toFixed(2), signal: bbSig },
      stoch:   { value: isNaN(stochK) ? null : +stochK.toFixed(2),   signal: stochSig },
      ema20:   isNaN(e20)  ? null : e20,
      ema50:   isNaN(e50)  ? null : e50,
      ema200:  isNaN(e200) ? null : e200,
      atr:     calcATR(highs, lows, closes, 14)[last],
      bbWidth: bbRes.width[last],
      obv:     calcOBV(closes, volumes)[last],
      overall: { score: +score.toFixed(1), direction },
    };
  }

  /* ═══════════════════════════════════════════════════════
     EXPORT
  ═══════════════════════════════════════════════════════ */
  window.Indicators = {
    // Trend
    calcSMA,
    calcEMA,
    calcMACD,
    calcBollingerBands,
    calcParabolicSAR,
    calcIchimoku,
    // Momentum
    calcRSI,
    calcStochastic,
    calcWilliamsR,
    calcCCI,
    calcMomentum,
    // Volume
    calcOBV,
    calcVolumeEMA,
    // Volatility
    calcATR,
    calcStdDev,
    // Support & Resistance
    calcPivotPoints,
    findSwingHighLow,
    findKeyLevels,
    // Signal
    getSignals,
  };

  console.log('[Indicators] indicators.js v3.0 loaded — 19 indicators ready');
})();
