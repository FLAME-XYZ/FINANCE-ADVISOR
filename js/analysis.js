/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — analysis.js  (v3.0)
   Library analisis advanced: SMC, ICT, Fibonacci, Elliott Wave,
   Wyckoff, Harmonic Patterns, Price Action, Supply & Demand
   
   Input  : OHLCV array [{time, open, high, low, close, volume}]
   Output : window.Analysis = { Fibonacci, SMC, ICT, PriceAction,
                                 SupplyDemand, Elliott, Wyckoff, Harmonic }
   Bergantung pada: window.Indicators (indicators.js)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     INTERNAL HELPERS
  ───────────────────────────────────────────────────────── */

  /** Ambil ATR terakhir dari array OHLCV */
  function _getATR(ohlcv, period = 14) {
    if (!ohlcv || ohlcv.length < period + 1) return 0;
    if (window.Indicators && window.Indicators.calcATR) {
      const highs  = ohlcv.map(c => c.high);
      const lows   = ohlcv.map(c => c.low);
      const closes = ohlcv.map(c => c.close);
      const arr    = window.Indicators.calcATR(highs, lows, closes, period);
      const val    = arr[arr.length - 1];
      return isNaN(val) ? 0 : val;
    }
    // Fallback manual
    const n   = ohlcv.length;
    let trSum = 0;
    const start = Math.max(1, n - period);
    for (let i = start; i < n; i++) {
      trSum += Math.max(
        ohlcv[i].high - ohlcv[i].low,
        Math.abs(ohlcv[i].high - ohlcv[i - 1].close),
        Math.abs(ohlcv[i].low  - ohlcv[i - 1].close)
      );
    }
    return trSum / (n - start);
  }

  /** Cari swing high/low menggunakan lookback */
  function _swingPoints(ohlcv, lookback = 5) {
    const highs  = ohlcv.map(c => c.high);
    const lows   = ohlcv.map(c => c.low);
    if (window.Indicators && window.Indicators.findSwingHighLow) {
      return window.Indicators.findSwingHighLow(highs, lows, lookback);
    }
    const n          = ohlcv.length;
    const swingHighs = [];
    const swingLows  = [];
    for (let i = lookback; i < n - lookback; i++) {
      let isHigh = true, isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
        if (lows[i]  >= lows[i - j]  || lows[i]  >= lows[i + j])  isLow  = false;
      }
      if (isHigh) swingHighs.push({ index: i, price: highs[i] });
      if (isLow)  swingLows.push ({ index: i, price: lows[i]  });
    }
    return { swingHighs, swingLows };
  }

  /** Hitung rata-rata range candle */
  function _avgRange(ohlcv, period = 14) {
    const n   = ohlcv.length;
    const cnt = Math.min(period, n);
    let   sum = 0;
    for (let i = n - cnt; i < n; i++) sum += ohlcv[i].high - ohlcv[i].low;
    return cnt > 0 ? sum / cnt : 0;
  }

  /** Guard: kembalikan hasil default jika data tidak cukup */
  function _guard(ohlcv, minLen = 30, defaultVal = null) {
    return (!ohlcv || ohlcv.length < minLen) ? defaultVal : false;
  }


  /* ═══════════════════════════════════════════════════════════
     MODULE 1 — FIBONACCI
  ═══════════════════════════════════════════════════════════ */
  const Fibonacci = {

    /**
     * calcRetracement(swingHigh, swingLow)
     * Menghitung level retracement Fibonacci dari swing high ke swing low (uptrend)
     * atau swing low ke swing high (downtrend — swap parameter)
     * @returns {Array} [{ level, price, label, isGoldenPocket }]
     */
    calcRetracement(swingHigh, swingLow) {
      const range  = swingHigh - swingLow;
      const levels = [
        { level: 0,     label: '0%'     },
        { level: 0.236, label: '23.6%'  },
        { level: 0.382, label: '38.2%'  },
        { level: 0.5,   label: '50%'    },
        { level: 0.618, label: '61.8%'  },
        { level: 0.65,  label: '65%'    },
        { level: 0.786, label: '78.6%'  },
        { level: 1.0,   label: '100%'   },
      ];
      return levels.map(l => ({
        level:          l.level,
        price:          swingHigh - l.level * range,
        label:          l.label,
        isGoldenPocket: l.level >= 0.618 && l.level <= 0.65,
      }));
    },

    /**
     * calcExtension(swingHigh, swingLow, swingLow2)
     * Extension untuk proyeksi target setelah retracement
     * swingLow2 = titik akhir koreksi (biasanya sama dengan level retracement)
     */
    calcExtension(swingHigh, swingLow, swingLow2) {
      const range  = swingHigh - swingLow;
      const base   = swingLow2 || swingLow;
      const levels = [1.272, 1.382, 1.618, 2.0, 2.618];
      return levels.map(l => ({
        level: l,
        price: base + l * range,
        label: `${(l * 100).toFixed(1)}%`,
      }));
    },

    /**
     * autoFib(ohlcv)
     * Otomatis cari swing high/low terbaru dan kalkulasi Fibonacci
     * @returns { retracement, extension, swingHigh, swingLow, trend }
     */
    autoFib(ohlcv) {
      if (_guard(ohlcv, 20)) return null;
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
      if (swingHighs.length === 0 || swingLows.length === 0) return null;

      // Ambil swing terakhir
      const lastHigh = swingHighs[swingHighs.length - 1];
      const lastLow  = swingLows[swingLows.length - 1];

      // Tentukan trend: high lebih baru = bearish retracement; low lebih baru = bullish retracement
      const trend = lastHigh.index > lastLow.index ? 'bearish' : 'bullish';
      const sHigh = lastHigh.price;
      const sLow  = lastLow.price;

      const retracement = this.calcRetracement(sHigh, sLow);
      const lastClose   = ohlcv[ohlcv.length - 1].close;
      const extension   = this.calcExtension(sHigh, sLow, lastClose);

      return {
        swingHigh:   sHigh,
        swingLow:    sLow,
        trend,
        retracement,
        extension,
        currentPrice: lastClose,
      };
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 2 — SMC (Smart Money Concepts)
  ═══════════════════════════════════════════════════════════ */
  const SMC = {

    /**
     * detectOrderBlocks(ohlcv)
     * Bullish OB: candle bearish sebelum minimal 3 candle bullish berturut
     * Bearish OB: candle bullish sebelum minimal 3 candle bearish berturut
     */
    detectOrderBlocks(ohlcv) {
      if (_guard(ohlcv, 10)) return [];
      const n      = ohlcv.length;
      const result = [];

      for (let i = 0; i < n - 3; i++) {
        const c = ohlcv[i];
        const isBearishCandle = c.close < c.open;
        const isBullishCandle = c.close > c.open;

        // Bullish OB: candle bearish, diikuti 3+ candle bullish
        if (isBearishCandle) {
          let bullCount = 0;
          for (let j = i + 1; j < Math.min(i + 6, n); j++) {
            if (ohlcv[j].close > ohlcv[j].open) bullCount++;
            else break;
          }
          if (bullCount >= 3) {
            // Cek mitigasi: apakah harga sudah kembali ke zona OB
            const obHigh = c.high;
            const obLow  = c.low;
            let mitigated = false;
            for (let k = i + bullCount + 1; k < n; k++) {
              if (ohlcv[k].low <= obHigh && ohlcv[k].high >= obLow) {
                mitigated = true;
                break;
              }
            }
            result.push({
              type:      'bullish',
              high:      obHigh,
              low:       obLow,
              open:      c.open,
              close:     c.close,
              index:     i,
              time:      c.time,
              mitigated,
              strength:  bullCount >= 5 ? 'strong' : 'moderate',
            });
          }
        }

        // Bearish OB: candle bullish, diikuti 3+ candle bearish
        if (isBullishCandle) {
          let bearCount = 0;
          for (let j = i + 1; j < Math.min(i + 6, n); j++) {
            if (ohlcv[j].close < ohlcv[j].open) bearCount++;
            else break;
          }
          if (bearCount >= 3) {
            const obHigh = c.high;
            const obLow  = c.low;
            let mitigated = false;
            for (let k = i + bearCount + 1; k < n; k++) {
              if (ohlcv[k].high >= obLow && ohlcv[k].low <= obHigh) {
                mitigated = true;
                break;
              }
            }
            result.push({
              type:      'bearish',
              high:      obHigh,
              low:       obLow,
              open:      c.open,
              close:     c.close,
              index:     i,
              time:      c.time,
              mitigated,
              strength:  bearCount >= 5 ? 'strong' : 'moderate',
            });
          }
        }
      }

      // Kembalikan 10 OB terbaru saja
      return result.slice(-10);
    },

    /**
     * detectBOS(ohlcv)
     * Break of Structure: close menembus previous swing high/low
     */
    detectBOS(ohlcv) {
      if (_guard(ohlcv, 20)) return [];
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
      const n      = ohlcv.length;
      const result = [];

      // Bullish BOS: close menembus previous swing high
      for (let i = 1; i < swingHighs.length; i++) {
        const prevHigh = swingHighs[i - 1].price;
        const pivIdx   = swingHighs[i].index;
        // Cari candle pertama setelah swing low yang close-nya di atas prevHigh
        for (let j = pivIdx; j < n; j++) {
          if (ohlcv[j].close > prevHigh) {
            result.push({
              type:  'bullish',
              price: prevHigh,
              index: j,
              time:  ohlcv[j].time,
              label: 'BOS ↑',
            });
            break;
          }
        }
      }

      // Bearish BOS: close menembus previous swing low
      for (let i = 1; i < swingLows.length; i++) {
        const prevLow = swingLows[i - 1].price;
        const pivIdx  = swingLows[i].index;
        for (let j = pivIdx; j < n; j++) {
          if (ohlcv[j].close < prevLow) {
            result.push({
              type:  'bearish',
              price: prevLow,
              index: j,
              time:  ohlcv[j].time,
              label: 'BOS ↓',
            });
            break;
          }
        }
      }

      // Sort by index, ambil terbaru
      result.sort((a, b) => a.index - b.index);
      return result.slice(-8);
    },

    /**
     * detectCHoCH(ohlcv)
     * Change of Character: perubahan pertama arah struktur
     */
    detectCHoCH(ohlcv) {
      if (_guard(ohlcv, 20)) return [];
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
      const result = [];

      // Bearish CHoCH: dalam uptrend, pertama kali close di bawah previous swing low
      // Uptrend = setiap swing high lebih tinggi dari sebelumnya
      for (let i = 2; i < swingHighs.length; i++) {
        const isUptrend = swingHighs[i].price > swingHighs[i - 1].price &&
                          swingHighs[i - 1].price > swingHighs[i - 2].price;
        if (!isUptrend) continue;

        // Cari swing low yang terbentuk setelah swing high terakhir
        const afterHighIdx = swingHighs[i].index;
        const lows = swingLows.filter(sl => sl.index > afterHighIdx);
        if (lows.length < 2) continue;

        // CHoCH terjadi jika swing low baru di bawah swing low sebelumnya
        if (lows[lows.length - 1].price < lows[lows.length - 2].price) {
          result.push({
            type:  'bearish',
            price: lows[lows.length - 2].price,
            index: lows[lows.length - 1].index,
            time:  ohlcv[lows[lows.length - 1].index] ?
                   ohlcv[lows[lows.length - 1].index].time : null,
            label: 'CHoCH ↓',
          });
        }
      }

      // Bullish CHoCH: dalam downtrend, pertama kali close di atas previous swing high
      for (let i = 2; i < swingLows.length; i++) {
        const isDowntrend = swingLows[i].price < swingLows[i - 1].price &&
                            swingLows[i - 1].price < swingLows[i - 2].price;
        if (!isDowntrend) continue;

        const afterLowIdx = swingLows[i].index;
        const highs = swingHighs.filter(sh => sh.index > afterLowIdx);
        if (highs.length < 2) continue;

        if (highs[highs.length - 1].price > highs[highs.length - 2].price) {
          result.push({
            type:  'bullish',
            price: highs[highs.length - 2].price,
            index: highs[highs.length - 1].index,
            time:  ohlcv[highs[highs.length - 1].index] ?
                   ohlcv[highs[highs.length - 1].index].time : null,
            label: 'CHoCH ↑',
          });
        }
      }

      result.sort((a, b) => a.index - b.index);
      return result.slice(-6);
    },

    /**
     * detectFVG(ohlcv)
     * Fair Value Gap: gap antara high/low candle 3-candlestick sequence
     * Bullish FVG: low[i] > high[i-2] (gap ke atas)
     * Bearish FVG: high[i] < low[i-2] (gap ke bawah)
     */
    detectFVG(ohlcv) {
      if (_guard(ohlcv, 5)) return [];
      const n      = ohlcv.length;
      const result = [];
      const atr    = _getATR(ohlcv, 14);

      for (let i = 2; i < n; i++) {
        const c0 = ohlcv[i - 2];  // candle pertama
        const c2 = ohlcv[i];      // candle ketiga

        // Bullish FVG: low candle ke-3 lebih tinggi dari high candle ke-1
        if (c2.low > c0.high) {
          const gapSize = c2.low - c0.high;
          result.push({
            type:       'bullish',
            top:        c2.low,
            bottom:     c0.high,
            index:      i,
            time:       c2.time,
            sizeInPips: atr > 0 ? (gapSize / atr * 14).toFixed(1) : 0,
            filled:     false,
            midpoint:   (c2.low + c0.high) / 2,
          });
        }

        // Bearish FVG: high candle ke-3 lebih rendah dari low candle ke-1
        if (c2.high < c0.low) {
          const gapSize = c0.low - c2.high;
          result.push({
            type:       'bearish',
            top:        c0.low,
            bottom:     c2.high,
            index:      i,
            time:       c2.time,
            sizeInPips: atr > 0 ? (gapSize / atr * 14).toFixed(1) : 0,
            filled:     false,
            midpoint:   (c0.low + c2.high) / 2,
          });
        }
      }

      // Tandai FVG yang sudah terisi
      result.forEach(fvg => {
        for (let i = fvg.index + 1; i < n; i++) {
          if (fvg.type === 'bullish' && ohlcv[i].low <= fvg.bottom) {
            fvg.filled = true;
            break;
          }
          if (fvg.type === 'bearish' && ohlcv[i].high >= fvg.top) {
            fvg.filled = true;
            break;
          }
        }
      });

      return result.slice(-12);
    },

    /**
     * detectLiquidityZones(ohlcv)
     * Equal Highs / Equal Lows dalam toleransi 0.1%
     */
    detectLiquidityZones(ohlcv) {
      if (_guard(ohlcv, 20)) return { equalHighs: [], equalLows: [] };
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 4);

      function findEquals(points, tolerance = 0.001) {
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
          for (let j = i + 1; j < points.length; j++) {
            const avg  = (points[i].price + points[j].price) / 2;
            const diff = Math.abs(points[i].price - points[j].price) / avg;
            if (diff <= tolerance) {
              result.push({
                price:   avg,
                indices: [points[i].index, points[j].index],
                count:   2,
              });
            }
          }
        }
        // Deduplicate zona yang overlap
        return result.filter((z, idx) => {
          return !result.slice(0, idx).some(prev =>
            Math.abs(prev.price - z.price) / z.price < 0.002
          );
        });
      }

      return {
        equalHighs: findEquals(swingHighs),
        equalLows:  findEquals(swingLows),
      };
    },

    /**
     * detectPremiumDiscount(swingHigh, swingLow, currentPrice)
     * Zona premium (atas 50%) = potensial sell
     * Zona discount (bawah 50%) = potensial buy
     */
    detectPremiumDiscount(swingHigh, swingLow, currentPrice) {
      const range      = swingHigh - swingLow;
      if (range <= 0) return { zone: 'equilibrium', percentage: 50, midpoint: currentPrice };
      const midpoint   = swingLow + range * 0.5;
      const percentage = ((currentPrice - swingLow) / range) * 100;

      let zone;
      if (percentage >= 55)      zone = 'premium';
      else if (percentage <= 45) zone = 'discount';
      else                       zone = 'equilibrium';

      return {
        zone,
        percentage: +percentage.toFixed(1),
        midpoint,
        isOptimalBuy:  percentage <= 38.2,
        isOptimalSell: percentage >= 61.8,
      };
    },

    /**
     * getMarketStructure(ohlcv)
     * Tentukan struktur pasar: uptrend / downtrend / ranging
     * Berbasis Higher Highs/Higher Lows (HH/HL) atau Lower Highs/Lower Lows (LH/LL)
     */
    getMarketStructure(ohlcv) {
      if (_guard(ohlcv, 20)) {
        return { trend: 'ranging', highs: [], lows: [] };
      }
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
      const recentHighs = swingHighs.slice(-5);
      const recentLows  = swingLows.slice(-5);

      let hhCount = 0, hlCount = 0, lhCount = 0, llCount = 0;

      for (let i = 1; i < recentHighs.length; i++) {
        if (recentHighs[i].price > recentHighs[i - 1].price) hhCount++;
        else lhCount++;
      }
      for (let i = 1; i < recentLows.length; i++) {
        if (recentLows[i].price > recentLows[i - 1].price) hlCount++;
        else llCount++;
      }

      let trend;
      if (hhCount >= 2 && hlCount >= 2)     trend = 'uptrend';
      else if (lhCount >= 2 && llCount >= 2) trend = 'downtrend';
      else                                   trend = 'ranging';

      // Annotate highs/lows dengan type
      const annotateHighs = recentHighs.map((h, i) => ({
        ...h,
        type: (i === 0) ? 'swing' :
              (h.price > recentHighs[i - 1].price ? 'HH' : 'LH'),
      }));
      const annotateLows = recentLows.map((l, i) => ({
        ...l,
        type: (i === 0) ? 'swing' :
              (l.price > recentLows[i - 1].price ? 'HL' : 'LL'),
      }));

      return {
        trend,
        highs:       annotateHighs,
        lows:        annotateLows,
        hhCount,
        hlCount,
        lhCount,
        llCount,
      };
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 3 — ICT (Inner Circle Trader)
  ═══════════════════════════════════════════════════════════ */
  const ICT = {

    /** Killzone windows (UTC hours) */
    _killzones: [
      { name: 'Asian KZ',    start: 0,  end: 4,  short: 'AS', color: '#ffd700' },
      { name: 'London KZ',   start: 7,  end: 10, short: 'LN', color: '#4dabf7' },
      { name: 'NY AM KZ',    start: 13, end: 16, short: 'NY', color: '#00d084' },
      { name: 'NY PM KZ',    start: 19, end: 22, short: 'PM', color: '#ff9f43' },
      { name: 'Silver Bullet', start: 15, end: 16, short: 'SB', color: '#b892ff' },
    ],

    /**
     * getKillzoneStatus(utcHour)
     * @param {number} utcHour — 0-23
     */
    getKillzoneStatus(utcHour) {
      if (utcHour === undefined) {
        utcHour = new Date().getUTCHours();
      }
      const active = this._killzones.filter(kz =>
        utcHour >= kz.start && utcHour < kz.end
      );

      // Killzone berikutnya
      let nextKZ     = null;
      let minMinutes = Infinity;
      this._killzones.forEach(kz => {
        let hoursUntil = kz.start - utcHour;
        if (hoursUntil <= 0) hoursUntil += 24;
        const mins = hoursUntil * 60;
        if (mins > 0 && mins < minMinutes) {
          minMinutes = mins;
          nextKZ     = kz;
        }
      });

      return {
        isActive:          active.length > 0,
        activeKillzones:   active,
        name:              active.length > 0 ? active.map(k => k.name).join(', ') : 'No Active KZ',
        nextKillzone:      nextKZ,
        minutesUntilNext:  nextKZ ? minMinutes : 0,
      };
    },

    /**
     * detectOTE(ohlcv, direction)
     * Optimal Trade Entry: zona 62%-79% Fibonacci retracement
     * direction: 'buy' (cari retracement ke bawah) | 'sell' (cari retracement ke atas)
     */
    detectOTE(ohlcv, direction = 'buy') {
      if (_guard(ohlcv, 20)) return { zone: null, isActive: false };
      const fib    = Fibonacci.autoFib(ohlcv);
      if (!fib)    return { zone: null, isActive: false };

      const { retracement, currentPrice, swingHigh, swingLow } = fib;
      const level618 = retracement.find(r => r.level === 0.618);
      const level786 = retracement.find(r => r.level === 0.786);

      if (!level618 || !level786) return { zone: null, isActive: false };

      const zoneTop    = Math.max(level618.price, level786.price);
      const zoneBottom = Math.min(level618.price, level786.price);
      const isActive   = currentPrice >= zoneBottom && currentPrice <= zoneTop;

      return {
        zone:        { top: zoneTop, bottom: zoneBottom },
        isActive,
        currentPrice,
        retracement: ((swingHigh - currentPrice) / (swingHigh - swingLow) * 100).toFixed(1) + '%',
        recommendation: isActive
          ? (direction === 'buy' ? 'OTE BUY Zone Aktif' : 'OTE SELL Zone Aktif')
          : 'Di luar zona OTE',
      };
    },

    /**
     * detectSilverBullet(currentUTCTime)
     * Silver Bullet: 10:00-11:00 New York Time = 15:00-16:00 UTC
     */
    detectSilverBullet(currentUTCTime) {
      const now = currentUTCTime || new Date();
      const utcH = now.getUTCHours();
      const utcM = now.getUTCMinutes();
      const totalMinutes = utcH * 60 + utcM;

      const startMin = 15 * 60;  // 15:00 UTC
      const endMin   = 16 * 60;  // 16:00 UTC

      const isActive    = totalMinutes >= startMin && totalMinutes < endMin;
      const minutesLeft = isActive ? (endMin - totalMinutes) : 0;

      return {
        isActive,
        minutesLeft,
        windowUTC:   '15:00–16:00 UTC',
        windowNY:    '10:00–11:00 NY',
        description: isActive
          ? `Silver Bullet aktif — ${minutesLeft} menit tersisa`
          : 'Silver Bullet tidak aktif',
      };
    },

    /**
     * detectAMD(ohlcv)
     * AMD: Accumulation → Manipulation → Distribution
     * Deteksi fase berdasarkan pola harga vs volume
     */
    detectAMD(ohlcv) {
      if (_guard(ohlcv, 50)) return { phase: 'unknown', confidence: 0 };

      const n      = ohlcv.length;
      const recent = ohlcv.slice(-50);
      const atr    = _getATR(recent, 14);

      // Hitung range untuk 3 segmen terakhir
      const seg    = Math.floor(recent.length / 3);
      const seg1   = recent.slice(0, seg);
      const seg2   = recent.slice(seg, seg * 2);
      const seg3   = recent.slice(seg * 2);

      const rangeOf = arr => {
        const hi = Math.max(...arr.map(c => c.high));
        const lo = Math.min(...arr.map(c => c.low));
        return { hi, lo, range: hi - lo };
      };

      const r1 = rangeOf(seg1);
      const r2 = rangeOf(seg2);
      const r3 = rangeOf(seg3);

      const lastClose = recent[recent.length - 1].close;
      const firstOpen = recent[0].open;

      let phase, confidence;

      // Accumulation: konsolidasi sempit di awal
      if (r1.range < atr * 3 && r2.range > atr * 4) {
        phase      = 'accumulation';
        confidence = 65;
      }
      // Manipulation: spike tajam diikuti reversal
      else if (r2.range > r1.range * 1.5 && r3.range < r2.range) {
        phase      = 'manipulation';
        confidence = 70;
        // Tentukan arah manipulasi
        const midSeg2 = (r2.hi + r2.lo) / 2;
        if (lastClose > midSeg2) {
          phase = 'manipulation_bull'; // fake-down sebelum naik
        } else {
          phase = 'manipulation_bear'; // fake-up sebelum turun
        }
      }
      // Distribution: range melebar dengan trend jelas
      else if (r3.range > r1.range && Math.abs(lastClose - firstOpen) > atr * 3) {
        phase      = 'distribution';
        confidence = 60;
      }
      else {
        phase      = 'ranging';
        confidence = 40;
      }

      return { phase, confidence, atr, ranges: { r1, r2, r3 } };
    },

    /**
     * getDailyBias(ohlcv)
     * Bias harian berdasarkan premium/discount, struktur, dan killzone
     */
    getDailyBias(ohlcv) {
      if (_guard(ohlcv, 20)) return { bias: 'neutral', reasons: [] };

      const structure = SMC.getMarketStructure(ohlcv);
      const lastClose = ohlcv[ohlcv.length - 1].close;
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);

      if (swingHighs.length === 0 || swingLows.length === 0) {
        return { bias: 'neutral', reasons: ['Data swing tidak cukup'] };
      }

      const recentHigh = Math.max(...swingHighs.slice(-3).map(h => h.price));
      const recentLow  = Math.min(...swingLows.slice(-3).map(l => l.price));
      const pd         = SMC.detectPremiumDiscount(recentHigh, recentLow, lastClose);

      const reasons = [];
      let bullScore = 0, bearScore = 0;

      // Struktur
      if (structure.trend === 'uptrend')   { bullScore += 3; reasons.push('Uptrend structure (HH/HL)'); }
      if (structure.trend === 'downtrend') { bearScore += 3; reasons.push('Downtrend structure (LH/LL)'); }

      // Premium/Discount
      if (pd.zone === 'discount')  { bullScore += 2; reasons.push('Harga di Discount zone'); }
      if (pd.zone === 'premium')   { bearScore += 2; reasons.push('Harga di Premium zone'); }
      if (pd.isOptimalBuy)         { bullScore += 1; reasons.push('Optimal Buy zone (≤38.2%)'); }
      if (pd.isOptimalSell)        { bearScore += 1; reasons.push('Optimal Sell zone (≥61.8%)'); }

      // BOS terbaru
      const bosArr = SMC.detectBOS(ohlcv);
      if (bosArr.length > 0) {
        const lastBOS = bosArr[bosArr.length - 1];
        if (lastBOS.type === 'bullish') { bullScore += 2; reasons.push('Bullish BOS terkonfirmasi'); }
        if (lastBOS.type === 'bearish') { bearScore += 2; reasons.push('Bearish BOS terkonfirmasi'); }
      }

      let bias;
      if (bullScore > bearScore + 1)      bias = 'bullish';
      else if (bearScore > bullScore + 1)  bias = 'bearish';
      else                                 bias = 'neutral';

      return { bias, bullScore, bearScore, reasons, premiumDiscount: pd };
    },

    /**
     * detectBreakerBlock(ohlcv, orderBlocks)
     * Breaker Block: OB yang sudah dimitigasi dan berbalik fungsi
     */
    detectBreakerBlock(ohlcv, orderBlocks) {
      if (!orderBlocks || orderBlocks.length === 0) {
        orderBlocks = SMC.detectOrderBlocks(ohlcv);
      }
      const lastClose = ohlcv[ohlcv.length - 1].close;

      return orderBlocks
        .filter(ob => ob.mitigated)
        .map(ob => {
          // Bullish OB yang dimitigasi → sekarang jadi Bearish Breaker
          const isBullishBreaker = ob.type === 'bearish' && lastClose < ob.low;
          const isBearishBreaker = ob.type === 'bullish' && lastClose > ob.high;
          const isActive = isBullishBreaker
            ? (lastClose >= ob.low  && lastClose <= ob.high)
            : (lastClose >= ob.low  && lastClose <= ob.high);

          return {
            ...ob,
            isBullishBreaker,
            isBearishBreaker,
            breakerType: isBullishBreaker ? 'bullish_breaker' : 'bearish_breaker',
            isActive:    Math.abs(lastClose - (ob.high + ob.low) / 2) <
                         (ob.high - ob.low) * 2,
          };
        })
        .filter(ob => ob.isBullishBreaker || ob.isBearishBreaker);
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 4 — PRICE ACTION / CANDLESTICK PATTERNS
  ═══════════════════════════════════════════════════════════ */
  const PriceAction = {

    /**
     * detectCandlePatterns(ohlcv)
     * Deteksi berbagai pola candlestick single & multi candle
     */
    detectCandlePatterns(ohlcv) {
      if (_guard(ohlcv, 5)) return [];
      const n      = ohlcv.length;
      const result = [];
      const atr    = _getATR(ohlcv, 14);

      for (let i = 2; i < n; i++) {
        const c  = ohlcv[i];
        const p1 = ohlcv[i - 1];
        const p2 = ohlcv[i - 2];

        const body    = Math.abs(c.close - c.open);
        const range   = c.high - c.low;
        const upperW  = c.high - Math.max(c.open, c.close);
        const lowerW  = Math.min(c.open, c.close) - c.low;
        const isBull  = c.close > c.open;
        const isBear  = c.close < c.open;
        const midBody = (c.open + c.close) / 2;

        // ── SINGLE CANDLE PATTERNS ──

        // Doji: body sangat kecil (< 10% range)
        if (body < range * 0.1 && range > atr * 0.3) {
          result.push({
            name: 'Doji', index: i, time: c.time,
            type: 'neutral', accuracy: 55,
            price: c.close,
          });
        }

        // Hammer: lower wick >= 2x body, small upper wick, at downtrend
        if (lowerW >= body * 2 && upperW <= body * 0.5 && range > atr * 0.5) {
          result.push({
            name: 'Hammer', index: i, time: c.time,
            type: 'bullish', accuracy: 72,
            price: c.close,
          });
        }

        // Shooting Star: upper wick >= 2x body, small lower wick, at uptrend
        if (upperW >= body * 2 && lowerW <= body * 0.5 && range > atr * 0.5) {
          result.push({
            name: 'Shooting Star', index: i, time: c.time,
            type: 'bearish', accuracy: 72,
            price: c.close,
          });
        }

        // Inverted Hammer: upper wick besar, di downtrend (reversal bullish)
        if (upperW >= body * 2 && lowerW <= body * 0.5 && p1.close < p1.open) {
          result.push({
            name: 'Inverted Hammer', index: i, time: c.time,
            type: 'bullish', accuracy: 62,
            price: c.close,
          });
        }

        // Marubozu Bullish: body >= 90% range
        if (body >= range * 0.9 && isBull && range > atr * 0.7) {
          result.push({
            name: 'Bullish Marubozu', index: i, time: c.time,
            type: 'bullish', accuracy: 75,
            price: c.close,
          });
        }

        // Marubozu Bearish
        if (body >= range * 0.9 && isBear && range > atr * 0.7) {
          result.push({
            name: 'Bearish Marubozu', index: i, time: c.time,
            type: 'bearish', accuracy: 75,
            price: c.close,
          });
        }

        // Spinning Top: body kecil, wick kiri kanan hampir sama
        if (body < range * 0.3 && upperW > range * 0.2 && lowerW > range * 0.2) {
          result.push({
            name: 'Spinning Top', index: i, time: c.time,
            type: 'neutral', accuracy: 50,
            price: c.close,
          });
        }

        // Pin Bar: lower/upper wick >= 66% dari range keseluruhan
        if (lowerW >= range * 0.66 && body < range * 0.25) {
          result.push({
            name: 'Bullish Pin Bar', index: i, time: c.time,
            type: 'bullish', accuracy: 78,
            price: c.close,
          });
        }
        if (upperW >= range * 0.66 && body < range * 0.25) {
          result.push({
            name: 'Bearish Pin Bar', index: i, time: c.time,
            type: 'bearish', accuracy: 78,
            price: c.close,
          });
        }

        if (i < 1) continue; // butuh min 2 candle

        const pb    = Math.abs(p1.close - p1.open);
        const pbull = p1.close > p1.open;
        const pbear = p1.close < p1.open;

        // ── TWO-CANDLE PATTERNS ──

        // Bullish Engulfing: candle hijau besar menelan candle merah sebelumnya
        if (isBull && pbear && c.open < p1.close && c.close > p1.open && body > pb * 1.1) {
          result.push({
            name: 'Bullish Engulfing', index: i, time: c.time,
            type: 'bullish', accuracy: 80,
            price: c.close,
          });
        }

        // Bearish Engulfing
        if (isBear && pbull && c.open > p1.close && c.close < p1.open && body > pb * 1.1) {
          result.push({
            name: 'Bearish Engulfing', index: i, time: c.time,
            type: 'bearish', accuracy: 80,
            price: c.close,
          });
        }

        // Bullish Harami: kecil di dalam besar (bullish)
        if (isBull && pbear && c.open > p1.close && c.close < p1.open && body < pb * 0.5) {
          result.push({
            name: 'Bullish Harami', index: i, time: c.time,
            type: 'bullish', accuracy: 65,
            price: c.close,
          });
        }

        // Bearish Harami
        if (isBear && pbull && c.open < p1.close && c.close > p1.open && body < pb * 0.5) {
          result.push({
            name: 'Bearish Harami', index: i, time: c.time,
            type: 'bearish', accuracy: 65,
            price: c.close,
          });
        }

        // Inside Bar: range candle sepenuhnya di dalam range candle sebelumnya
        if (c.high < p1.high && c.low > p1.low) {
          result.push({
            name: 'Inside Bar', index: i, time: c.time,
            type: 'neutral', accuracy: 60,
            price: c.close,
          });
        }

        // Outside Bar: range candle sepenuhnya melebihi candle sebelumnya
        if (c.high > p1.high && c.low < p1.low) {
          result.push({
            name: 'Outside Bar', index: i, time: c.time,
            type: isBull ? 'bullish' : 'bearish', accuracy: 68,
            price: c.close,
          });
        }

        // Tweezer Bottom: dua low hampir sama, pertama bearish, kedua bullish
        if (pbear && isBull && Math.abs(p1.low - c.low) / p1.low < 0.001) {
          result.push({
            name: 'Tweezer Bottom', index: i, time: c.time,
            type: 'bullish', accuracy: 70,
            price: c.close,
          });
        }

        // Tweezer Top: dua high hampir sama, pertama bullish, kedua bearish
        if (pbull && isBear && Math.abs(p1.high - c.high) / p1.high < 0.001) {
          result.push({
            name: 'Tweezer Top', index: i, time: c.time,
            type: 'bearish', accuracy: 70,
            price: c.close,
          });
        }

        // Dark Cloud Cover: bullish diikuti bearish yang open di atas high, close di bawah midpoint
        const midP1 = (p1.open + p1.close) / 2;
        if (pbull && isBear && c.open > p1.high && c.close < midP1) {
          result.push({
            name: 'Dark Cloud Cover', index: i, time: c.time,
            type: 'bearish', accuracy: 73,
            price: c.close,
          });
        }

        // Piercing Line: bearish diikuti bullish yang open di bawah low, close di atas midpoint
        const midP1b = (p1.open + p1.close) / 2;
        if (pbear && isBull && c.open < p1.low && c.close > midP1b) {
          result.push({
            name: 'Piercing Line', index: i, time: c.time,
            type: 'bullish', accuracy: 73,
            price: c.close,
          });
        }

        if (i < 2) continue;

        const p2bull = p2.close > p2.open;
        const p2bear = p2.close < p2.open;

        // ── THREE-CANDLE PATTERNS ──

        // Morning Star: bearish besar → doji/kecil → bullish besar
        if (p2bear && body < _avgRange([p2, p1, c], 3) * 0.3 && isBull &&
            c.close > (p2.open + p2.close) / 2) {
          result.push({
            name: 'Morning Star', index: i, time: c.time,
            type: 'bullish', accuracy: 82,
            price: c.close,
          });
        }

        // Evening Star: bullish besar → doji/kecil → bearish besar
        if (p2bull && body < _avgRange([p2, p1, c], 3) * 0.3 && isBear &&
            c.close < (p2.open + p2.close) / 2) {
          result.push({
            name: 'Evening Star', index: i, time: c.time,
            type: 'bearish', accuracy: 82,
            price: c.close,
          });
        }

        // Three White Soldiers: 3 candle bullish berturut
        const pb2 = Math.abs(p2.close - p2.open);
        if (p2bull && pbull && isBull &&
            p1.close > p2.close && c.close > p1.close &&
            pb2 > atr * 0.5 && pb > atr * 0.5 && body > atr * 0.5) {
          result.push({
            name: 'Three White Soldiers', index: i, time: c.time,
            type: 'bullish', accuracy: 84,
            price: c.close,
          });
        }

        // Three Black Crows: 3 candle bearish berturut
        if (p2bear && pbear && isBear &&
            p1.close < p2.close && c.close < p1.close &&
            pb2 > atr * 0.5 && pb > atr * 0.5 && body > atr * 0.5) {
          result.push({
            name: 'Three Black Crows', index: i, time: c.time,
            type: 'bearish', accuracy: 84,
            price: c.close,
          });
        }
      }

      // Hanya kembalikan 10 pola terbaru
      return result.slice(-10);
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 5 — SUPPLY & DEMAND ZONES
  ═══════════════════════════════════════════════════════════ */
  const SupplyDemand = {

    /**
     * detectZones(ohlcv)
     * Supply zone: zona konsolidasi sebelum impulse move ke bawah (>= 3x ATR)
     * Demand zone: zona konsolidasi sebelum impulse move ke atas (>= 3x ATR)
     */
    detectZones(ohlcv) {
      if (_guard(ohlcv, 20)) return { supply: [], demand: [] };
      const n   = ohlcv.length;
      const atr = _getATR(ohlcv, 14);
      const supply = [];
      const demand = [];

      for (let i = 3; i < n - 2; i++) {
        // Cek impulse move ke atas (demand zone sebelumnya)
        const moveUp = ohlcv[i + 1].close - ohlcv[i].low;
        if (moveUp >= atr * 2.5) {
          // Base: 1-3 candle konsolidasi sebelum move
          const baseStart = Math.max(0, i - 2);
          const baseHigh  = Math.max(...ohlcv.slice(baseStart, i + 1).map(c => c.high));
          const baseLow   = Math.min(...ohlcv.slice(baseStart, i + 1).map(c => c.low));

          // Hitung berapa kali ditest
          let testCount = 0;
          for (let j = i + 2; j < n; j++) {
            if (ohlcv[j].low <= baseHigh && ohlcv[j].high >= baseLow) testCount++;
          }

          const quality =
            testCount === 0 ? 'fresh' :
            testCount === 1 ? 'tested_once' : 'tested_multiple';

          demand.push({
            top:      baseHigh,
            bottom:   baseLow,
            proximal: baseHigh,   // level terdekat dari harga sekarang
            distal:   baseLow,    // level terjauh
            index:    i,
            time:     ohlcv[i].time,
            testCount,
            quality,
            strength: moveUp / atr,
          });
        }

        // Cek impulse move ke bawah (supply zone sebelumnya)
        const moveDown = ohlcv[i].high - ohlcv[i + 1].close;
        if (moveDown >= atr * 2.5) {
          const baseStart = Math.max(0, i - 2);
          const baseHigh  = Math.max(...ohlcv.slice(baseStart, i + 1).map(c => c.high));
          const baseLow   = Math.min(...ohlcv.slice(baseStart, i + 1).map(c => c.low));

          let testCount = 0;
          for (let j = i + 2; j < n; j++) {
            if (ohlcv[j].high >= baseLow && ohlcv[j].low <= baseHigh) testCount++;
          }

          const quality =
            testCount === 0 ? 'fresh' :
            testCount === 1 ? 'tested_once' : 'tested_multiple';

          supply.push({
            top:      baseHigh,
            bottom:   baseLow,
            proximal: baseLow,
            distal:   baseHigh,
            index:    i,
            time:     ohlcv[i].time,
            testCount,
            quality,
            strength: moveDown / atr,
          });
        }
      }

      // Deduplicate zona yang overlap
      function dedup(zones) {
        return zones.filter((z, idx) => {
          return !zones.slice(0, idx).some(prev =>
            Math.abs(prev.top - z.top) / z.top < 0.003 &&
            Math.abs(prev.bottom - z.bottom) / z.bottom < 0.003
          );
        }).slice(-8);
      }

      return {
        supply: dedup(supply),
        demand: dedup(demand),
      };
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 6 — ELLIOTT WAVE
  ═══════════════════════════════════════════════════════════ */
  const Elliott = {

    /**
     * detectWaves(ohlcv)
     * Identifikasi 5-wave impulsive menggunakan swing points (zigzag)
     * Validasi Rules: Wave2 < Wave1 start, Wave3 terpanjang, Wave4 tidak overlap Wave1
     */
    detectWaves(ohlcv) {
      if (_guard(ohlcv, 30)) {
        return { waves: [], isValid: false, currentWave: null, projection: null };
      }

      const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
      const lastClose = ohlcv[ohlcv.length - 1].close;

      // Interleave swing highs dan lows berdasarkan index untuk membentuk zigzag
      const allPivots = [
        ...swingHighs.map(p => ({ ...p, isHigh: true })),
        ...swingLows.map(p => ({ ...p, isHigh: false })),
      ].sort((a, b) => a.index - b.index);

      // Ambil 10 pivot terakhir
      const pivots = allPivots.slice(-10);
      if (pivots.length < 5) {
        return { waves: [], isValid: false, currentWave: null, projection: null };
      }

      // Coba identifikasi 5-wave dari setiap set 6 pivot
      let bestWave = null;

      for (let start = 0; start <= pivots.length - 6; start++) {
        const pts = pivots.slice(start, start + 6);

        // Pastikan alternating high-low-high-low-high-low (untuk bullish)
        // atau low-high-low-high-low-high (untuk bearish)
        const bullish = !pts[0].isHigh &&  pts[1].isHigh && !pts[2].isHigh &&
                         pts[3].isHigh && !pts[4].isHigh &&  pts[5].isHigh;
        const bearish =  pts[0].isHigh && !pts[1].isHigh &&  pts[2].isHigh &&
                        !pts[3].isHigh &&  pts[4].isHigh && !pts[5].isHigh;

        if (!bullish && !bearish) continue;

        const w = bullish ? {
          w1start: pts[0].price, w1end: pts[1].price,
          w2end:   pts[2].price, w3end: pts[3].price,
          w4end:   pts[4].price, w5end: pts[5].price,
          direction: 'bullish',
          indices: pts.map(p => p.index),
        } : {
          w1start: pts[0].price, w1end: pts[1].price,
          w2end:   pts[2].price, w3end: pts[3].price,
          w4end:   pts[4].price, w5end: pts[5].price,
          direction: 'bearish',
          indices: pts.map(p => p.index),
        };

        // Validasi Elliott Rules
        const wave1 = Math.abs(w.w1end - w.w1start);
        const wave2 = Math.abs(w.w2end - w.w1end);
        const wave3 = Math.abs(w.w3end - w.w2end);
        const wave4 = Math.abs(w.w4end - w.w3end);
        const wave5 = Math.abs(w.w5end - w.w4end);

        // Rule 1: Wave 2 tidak menembus start Wave 1
        const rule1 = bullish
          ? (w.w2end > w.w1start)
          : (w.w2end < w.w1start);

        // Rule 2: Wave 3 tidak boleh terpendek
        const rule2 = wave3 >= wave1 && wave3 >= wave5;

        // Rule 3: Wave 4 tidak overlap Wave 1
        const rule3 = bullish
          ? (w.w4end > w.w1end)
          : (w.w4end < w.w1end);

        if (rule1 && rule2 && rule3) {
          bestWave = w;
          bestWave.waveLengths = { wave1, wave2, wave3, wave4, wave5 };
          break;
        }
      }

      if (!bestWave) {
        // Identifikasi posisi wave saat ini secara sederhana
        const structure = SMC.getMarketStructure(ohlcv);
        return {
          waves:       [],
          isValid:     false,
          currentWave: null,
          structure,
          note:        'Wave 5-impulsive belum terkonfirmasi. Gunakan bersama konfluensi lain.',
        };
      }

      // Proyeksi wave berikutnya
      const wl         = bestWave.waveLengths;
      const lastPoint  = bestWave.w5end;
      let projection   = null;

      if (bestWave.direction === 'bullish') {
        // Setelah 5 waves up → expect 3 waves down (ABC correction)
        const avgRetrace = wl.wave2 + wl.wave4 / 2;
        projection = {
          type:    'ABC Correction (bearish)',
          target1: lastPoint - wl.wave1 * 0.382,
          target2: lastPoint - wl.wave1 * 0.618,
          target3: lastPoint - wl.wave1,
        };
      } else {
        const avgRetrace = wl.wave2 + wl.wave4 / 2;
        projection = {
          type:    'ABC Correction (bullish)',
          target1: lastPoint + wl.wave1 * 0.382,
          target2: lastPoint + wl.wave1 * 0.618,
          target3: lastPoint + wl.wave1,
        };
      }

      // Format waves array untuk display
      const waveLabels = ['0', '1', '2', '3', '4', '5'];
      const wavePrices = [
        bestWave.w1start, bestWave.w1end, bestWave.w2end,
        bestWave.w3end, bestWave.w4end, bestWave.w5end,
      ];
      const waves = waveLabels.map((label, i) => ({
        label,
        price: wavePrices[i],
        index: bestWave.indices[i] || 0,
      }));

      return {
        waves,
        isValid:     true,
        currentWave: 5,      // setelah 5 wave teridentifikasi
        direction:   bestWave.direction,
        projection,
        waveLengths: wl,
      };
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 7 — WYCKOFF
  ═══════════════════════════════════════════════════════════ */
  const Wyckoff = {

    /**
     * detectPhase(ohlcv)
     * Identifikasi fase Wyckoff: Accumulation / Markup / Distribution / Markdown
     * Simplified detection berdasarkan price structure & volume
     */
    detectPhase(ohlcv) {
      if (_guard(ohlcv, 50)) {
        return {
          phase: 'unknown', subPhase: 'A',
          events: [], confidence: 0, recommendation: 'Data tidak cukup',
        };
      }

      const n       = ohlcv.length;
      const recent  = ohlcv.slice(-60);
      const atr     = _getATR(recent, 14);
      const closes  = recent.map(c => c.close);
      const volumes = recent.map(c => c.volume || 0);

      // Hitung trend keseluruhan
      const firstClose  = closes[0];
      const lastClose   = closes[closes.length - 1];
      const priceChange = (lastClose - firstClose) / firstClose;

      // Range analysis — ukur volatilitas
      const rangeArr = recent.map(c => c.high - c.low);
      const avgRange = rangeArr.reduce((s, r) => s + r, 0) / rangeArr.length;

      // Volume analysis
      const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
      const lastVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
      const volTrend = lastVol > avgVol * 1.3 ? 'increasing' :
                       lastVol < avgVol * 0.7 ? 'decreasing' : 'flat';

      // Hitung swing highs/lows untuk structure
      const { swingHighs, swingLows } = _swingPoints(recent, 5);
      const recentHighs = swingHighs.slice(-3).map(h => h.price);
      const recentLows  = swingLows.slice(-3).map(l => l.price);

      // Deteksi konsolidasi (Trading Range)
      const highRange = recentHighs.length > 1
        ? Math.max(...recentHighs) - Math.min(...recentHighs) : 0;
      const lowRange  = recentLows.length > 1
        ? Math.max(...recentLows)  - Math.min(...recentLows)  : 0;
      const isConsolidating = highRange < atr * 5 && lowRange < atr * 5;

      let phase, subPhase, events = [], confidence, recommendation;

      // ── Logic Wyckoff ──
      if (isConsolidating && priceChange < 0.02 && priceChange > -0.05) {
        // Konsolidasi setelah downtrend → mungkin Accumulation
        if (volTrend === 'decreasing') {
          phase      = 'accumulation';
          subPhase   = 'B';
          confidence = 65;
          events     = ['Trading Range (TR)', 'Low volume selama konsolidasi'];
          recommendation = 'Tunggu Wyckoff Spring atau test of support sebelum entry long';
        } else if (volTrend === 'increasing' && lastClose > firstClose) {
          phase      = 'accumulation';
          subPhase   = 'C';
          confidence = 72;
          events     = ['Spring terdeteksi', 'Volume meningkat saat harga naik'];
          recommendation = 'Potensi markup segera. Setup long di atas resistance TR.';
        } else {
          phase      = 'accumulation';
          subPhase   = 'A';
          confidence = 55;
          events     = ['Preliminary Support (PS)', 'Selling Climax (SC) potensial'];
          recommendation = 'Fase awal akumulasi. Belum konfirmasi.';
        }
      }
      else if (isConsolidating && priceChange > 0.01 && priceChange < 0.06) {
        // Konsolidasi setelah uptrend → mungkin Distribution
        if (volTrend === 'increasing') {
          phase      = 'distribution';
          subPhase   = 'B';
          confidence = 68;
          events     = ['Buying Climax (BC)', 'Automatic Reaction (AR)'];
          recommendation = 'Hati-hati long. Distribusi mungkin terjadi.';
        } else {
          phase      = 'distribution';
          subPhase   = 'A';
          confidence = 58;
          events     = ['Preliminary Supply (PSY)'];
          recommendation = 'Pantau tanda distribusi. Perketat SL long.';
        }
      }
      else if (priceChange > 0.05 && volTrend !== 'decreasing') {
        phase      = 'markup';
        subPhase   = 'D';
        confidence = 70;
        events     = ['Sign of Strength (SOS)', 'Last Point of Support (LPS)'];
        recommendation = 'Trend naik aktif. Cari pullback ke LPS untuk entry.';
      }
      else if (priceChange < -0.05 && volTrend !== 'decreasing') {
        phase      = 'markdown';
        subPhase   = 'E';
        confidence = 70;
        events     = ['Sign of Weakness (SOW)', 'Last Point of Supply (LPSY)'];
        recommendation = 'Trend turun aktif. Hindari long. Setup short di LPSY.';
      }
      else {
        phase      = 'ranging';
        subPhase   = 'A';
        confidence = 40;
        events     = ['Tidak ada pola Wyckoff jelas'];
        recommendation = 'Tidak ada trade setup Wyckoff saat ini.';
      }

      return { phase, subPhase, events, confidence, recommendation, volTrend, priceChange };
    },
  };


  /* ═══════════════════════════════════════════════════════════
     MODULE 8 — HARMONIC PATTERNS
  ═══════════════════════════════════════════════════════════ */
  const Harmonic = {

    /** Definisi rasio untuk setiap pola */
    _patterns: {
      Gartley:  {
        XAB: [0.618, 0.618], ABC: [0.382, 0.886], BCD: [1.13, 1.618],
        XAD: [0.786, 0.786],
      },
      Butterfly: {
        XAB: [0.786, 0.786], ABC: [0.382, 0.886], BCD: [1.618, 2.24],
        XAD: [1.27, 1.618],
      },
      Bat: {
        XAB: [0.382, 0.5], ABC: [0.382, 0.886], BCD: [1.618, 2.618],
        XAD: [0.886, 0.886],
      },
      Crab: {
        XAB: [0.382, 0.618], ABC: [0.382, 0.886], BCD: [2.24, 3.618],
        XAD: [1.618, 1.618],
      },
      Cypher: {
        XAB: [0.382, 0.618], ABC: [1.13, 1.414], BCD: [0.786, 0.786],
        XAD: [0.786, 0.786],
      },
      ABCD: {
        XAB: null, ABC: [0.382, 0.886], BCD: [1.13, 2.618],
        XAD: null,
      },
    },

    /** Cek apakah nilai dalam range [min, max] dengan toleransi */
    _inRange(val, min, max, tolerance = 0.1) {
      return val >= min * (1 - tolerance) && val <= max * (1 + tolerance);
    },

    /**
     * detectPatterns(ohlcv)
     * Deteksi pola Harmonic dari swing points
     */
    detectPatterns(ohlcv) {
      if (_guard(ohlcv, 30)) return [];
      const { swingHighs, swingLows } = _swingPoints(ohlcv, 4);
      const lastClose = ohlcv[ohlcv.length - 1].close;
      const found     = [];

      // Interleave pivots dan ambil set 5 titik terakhir (X,A,B,C,D)
      const pivots = [
        ...swingHighs.map(p => ({ ...p, isHigh: true })),
        ...swingLows.map(p => ({ ...p, isHigh: false })),
      ].sort((a, b) => a.index - b.index).slice(-10);

      if (pivots.length < 5) return [];

      // Coba setiap kombinasi 5 titik
      for (let i = 0; i <= pivots.length - 5; i++) {
        const [X, A, B, C, D] = pivots.slice(i, i + 5);

        const XA = Math.abs(A.price - X.price);
        const AB = Math.abs(B.price - A.price);
        const BC = Math.abs(C.price - B.price);
        const CD = Math.abs(D.price - C.price);
        const XD = Math.abs(D.price - X.price);

        if (XA === 0 || AB === 0 || BC === 0) continue;

        const ratioXAB = AB / XA;
        const ratioABC = BC / AB;
        const ratioBCD = CD / BC;
        const ratioXAD = XD / XA;

        Object.entries(this._patterns).forEach(([name, rules]) => {
          let score = 0;
          const checks = [];

          if (rules.XAB) {
            const ok = this._inRange(ratioXAB, rules.XAB[0], rules.XAB[1]);
            if (ok) score++; checks.push({ key: 'XAB', ratio: +ratioXAB.toFixed(3), ok });
          }
          if (rules.ABC) {
            const ok = this._inRange(ratioABC, rules.ABC[0], rules.ABC[1]);
            if (ok) score++; checks.push({ key: 'ABC', ratio: +ratioABC.toFixed(3), ok });
          }
          if (rules.BCD) {
            const ok = this._inRange(ratioBCD, rules.BCD[0], rules.BCD[1]);
            if (ok) score++; checks.push({ key: 'BCD', ratio: +ratioBCD.toFixed(3), ok });
          }

          const reqScore = rules.XAB ? 3 : 2;
          if (score < reqScore) return;

          // Tentukan arah dan PRZ
          const isBullish = A.price < X.price;  // pola bullish jika A di bawah X
          const PRZtop    = D.price * 1.002;
          const PRZbottom = D.price * 0.998;

          const isActive = lastClose >= PRZbottom * 0.99 && lastClose <= PRZtop * 1.01;
          const confidence = Math.round((score / (rules.XAB ? 4 : 3)) * 100);

          found.push({
            name,
            points: { X, A, B, C, D },
            ratios: { XAB: ratioXAB, ABC: ratioABC, BCD: ratioBCD, XAD: ratioXAD },
            PRZ:    { top: PRZtop, bottom: PRZbottom },
            direction:  isBullish ? 'bullish' : 'bearish',
            confidence,
            isComplete:  score >= reqScore,
            isActive,
            checks,
          });
        });
      }

      // Kembalikan pattern unik dengan confidence tertinggi
      const unique = [];
      found.forEach(f => {
        const dup = unique.find(u => u.name === f.name);
        if (!dup || f.confidence > dup.confidence) {
          if (dup) unique.splice(unique.indexOf(dup), 1);
          unique.push(f);
        }
      });

      return unique.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    },
  };


  /* ═══════════════════════════════════════════════════════════
     EXPORT — window.Analysis
  ═══════════════════════════════════════════════════════════ */
  window.Analysis = {
    Fibonacci,
    SMC,
    ICT,
    PriceAction,
    SupplyDemand,
    Elliott,
    Wyckoff,
    Harmonic,

    /**
     * runAll(ohlcv, symbol) — Jalankan semua analisis sekaligus
     * Berguna untuk dashboard atau summary
     */
    runAll(ohlcv, symbol) {
      if (!ohlcv || ohlcv.length < 20) return null;
      const lastClose = ohlcv[ohlcv.length - 1].close;

      try {
        const structure = SMC.getMarketStructure(ohlcv);
        const { swingHighs, swingLows } = _swingPoints(ohlcv, 5);
        const sHigh = swingHighs.length ? swingHighs[swingHighs.length - 1].price : lastClose * 1.01;
        const sLow  = swingLows.length  ? swingLows[swingLows.length - 1].price   : lastClose * 0.99;

        return {
          symbol:         symbol || 'UNKNOWN',
          price:          lastClose,
          structure,
          fibonacci:      Fibonacci.autoFib(ohlcv),
          orderBlocks:    SMC.detectOrderBlocks(ohlcv),
          bos:            SMC.detectBOS(ohlcv),
          choch:          SMC.detectCHoCH(ohlcv),
          fvg:            SMC.detectFVG(ohlcv),
          liquidity:      SMC.detectLiquidityZones(ohlcv),
          premiumDiscount:SMC.detectPremiumDiscount(sHigh, sLow, lastClose),
          icttBias:       ICT.getDailyBias(ohlcv),
          killzone:       ICT.getKillzoneStatus(),
          ote:            ICT.detectOTE(ohlcv),
          amd:            ICT.detectAMD(ohlcv),
          patterns:       PriceAction.detectCandlePatterns(ohlcv),
          supplyDemand:   SupplyDemand.detectZones(ohlcv),
          elliott:        Elliott.detectWaves(ohlcv),
          wyckoff:        Wyckoff.detectPhase(ohlcv),
          harmonic:       Harmonic.detectPatterns(ohlcv),
          timestamp:      Date.now(),
        };
      } catch (err) {
        console.error('[Analysis] runAll error:', err);
        return null;
      }
    },
  };

  console.log('[Analysis] analysis.js v3.0 loaded — SMC/ICT/Fibonacci/Elliott/Wyckoff/Harmonic ready');
})();
