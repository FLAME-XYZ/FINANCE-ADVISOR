/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — signals.js  (v3.0)
   Sistem scoring konfluens, signal generation, MTF analysis,
   dan ringkasan indikator teknikal.

   Expose  : window.Signals = { calcConfluenceScore, generateTradeSetup,
                                  getMTFAnalysis, getIndicatorSummary }
   Bergantung pada: window.Indicators, window.Analysis, window.AppState,
                    window.CONFIG (config.js)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     INTERNAL HELPERS
  ───────────────────────────────────────────────────────── */

  /** Ambil pip size untuk instrumen */
  function _getPip(symbol) {
    if (!symbol) return 0.0001;
    if (symbol.includes('JPY'))      return 0.01;
    if (symbol.endsWith('USDT'))     return 1;       // crypto: 1 unit = 1 "pip"
    if (symbol.endsWith('IDR'))      return 1;
    return 0.0001;
  }

  /** Konversi harga difference ke pips */
  function _toPips(priceDiff, symbol) {
    const pip = _getPip(symbol);
    return pip > 0 ? Math.abs(priceDiff) / pip : Math.abs(priceDiff);
  }

  /** Ambil ATR dari Indicators */
  function _getATR(ohlcv, period = 14) {
    if (!ohlcv || ohlcv.length < period + 1) return 0;
    if (window.Indicators && window.Indicators.calcATR) {
      const h = ohlcv.map(c => c.high);
      const l = ohlcv.map(c => c.low);
      const c = ohlcv.map(c => c.close);
      const arr = window.Indicators.calcATR(h, l, c, period);
      const val = arr[arr.length - 1];
      return isNaN(val) ? 0 : val;
    }
    // Fallback simple ATR
    const n = ohlcv.length;
    let sum = 0;
    const start = Math.max(1, n - period);
    for (let i = start; i < n; i++) {
      sum += Math.max(
        ohlcv[i].high - ohlcv[i].low,
        Math.abs(ohlcv[i].high - ohlcv[i - 1].close),
        Math.abs(ohlcv[i].low  - ohlcv[i - 1].close)
      );
    }
    return sum / (n - start);
  }

  /** Ambil data OHLCV dari AppState */
  function _getOHLCV(symbol, timeframe) {
    const state = window.AppState;
    if (!state || !state.ohlcv) return null;
    const key = `${symbol}_${timeframe}`;
    return state.ohlcv[key] || null;
  }

  /** Guard: cek data cukup */
  function _guard(ohlcv, minLen = 30) {
    return (!ohlcv || ohlcv.length < minLen);
  }

  /** Ambil Analysis module dengan safety check */
  function _A() { return window.Analysis || null; }
  function _I() { return window.Indicators || null; }

  /** Format angka dengan desimal */
  function _fmt(val, dec = 5) {
    if (val === null || val === undefined || isNaN(val)) return null;
    return parseFloat(val.toFixed(dec));
  }


  /* ═══════════════════════════════════════════════════════════
     1. CONFLUENCE SCORE CALCULATOR
     Total 0–20, setiap kategori memiliki bobot masing-masing
  ═══════════════════════════════════════════════════════════ */

  /**
   * calcConfluenceScore(ohlcv, currentPrice, symbol)
   * Menghitung skor konfluensi dari berbagai metode analisis
   *
   * @param {Array}  ohlcv         - Array OHLCV
   * @param {number} currentPrice  - Harga saat ini
   * @param {string} symbol        - Simbol instrumen (opsional)
   * @returns {Object} { total, breakdown, direction, strength, details }
   */
  function calcConfluenceScore(ohlcv, currentPrice, symbol) {
    const result = {
      total: 0,
      breakdown: {
        demandSupply:    0,
        orderBlock:      0,
        fvg:             0,
        bos:             0,
        fibonacci:       0,
        candlePattern:   0,
        rsi:             0,
        macd:            0,
        killzone:        0,
        wyckoff:         0,
        harmonic:        0,
        elliott:         0,
        premiumDiscount: 0,
      },
      direction:  'neutral',
      strength:   'low',
      details:    [],
      timestamp:  Date.now(),
    };

    if (_guard(ohlcv, 30)) return result;

    const A    = _A();
    const I    = _I();
    const last = ohlcv[ohlcv.length - 1];
    const price = currentPrice || last.close;

    let bullPoints = 0;
    let bearPoints = 0;

    /* ── +2: Supply/Demand Zone (fresh) ────────────────────── */
    try {
      if (A && A.SupplyDemand) {
        const sd = A.SupplyDemand.detectZones(ohlcv);

        // Cari demand zone yang mengandung harga saat ini
        const activeDemand = sd.demand.find(z =>
          price >= z.bottom * 0.998 && price <= z.top * 1.002
        );
        if (activeDemand) {
          const pts = activeDemand.quality === 'fresh' ? 2 : 1;
          result.breakdown.demandSupply += pts;
          bullPoints += pts;
          result.details.push({
            method: 'Demand Zone',
            signal: 'buy',
            points: pts,
            note: `${activeDemand.quality} demand zone @ ${activeDemand.bottom.toFixed(5)}–${activeDemand.top.toFixed(5)}`,
          });
        }

        // Cari supply zone yang mengandung harga saat ini
        const activeSupply = sd.supply.find(z =>
          price >= z.bottom * 0.998 && price <= z.top * 1.002
        );
        if (activeSupply) {
          const pts = activeSupply.quality === 'fresh' ? 2 : 1;
          result.breakdown.demandSupply += pts;
          bearPoints += pts;
          result.details.push({
            method: 'Supply Zone',
            signal: 'sell',
            points: pts,
            note: `${activeSupply.quality} supply zone @ ${activeSupply.bottom.toFixed(5)}–${activeSupply.top.toFixed(5)}`,
          });
        }
      }
    } catch (e) { /* silent */ }

    /* ── +2: Order Block (belum dimitigasi) ─────────────────── */
    try {
      if (A && A.SMC) {
        const obs = A.SMC.detectOrderBlocks(ohlcv);
        const atr = _getATR(ohlcv, 14);

        obs.filter(ob => !ob.mitigated).forEach(ob => {
          const inZone = price >= ob.low * (1 - 0.002) && price <= ob.high * (1 + 0.002);
          const nearZone = Math.abs(price - (ob.high + ob.low) / 2) < atr * 2;

          if (inZone || nearZone) {
            const pts = ob.strength === 'strong' ? 2 : 1;
            result.breakdown.orderBlock += pts;
            if (ob.type === 'bullish') {
              bullPoints += pts;
              result.details.push({
                method: 'Bullish Order Block',
                signal: 'buy', points: pts,
                note: `OB @ ${ob.low.toFixed(5)}–${ob.high.toFixed(5)} (${ob.strength})`,
              });
            } else {
              bearPoints += pts;
              result.details.push({
                method: 'Bearish Order Block',
                signal: 'sell', points: pts,
                note: `OB @ ${ob.low.toFixed(5)}–${ob.high.toFixed(5)} (${ob.strength})`,
              });
            }
          }
        });
        // Cap at 2
        result.breakdown.orderBlock = Math.min(result.breakdown.orderBlock, 2);
      }
    } catch (e) { /* silent */ }

    /* ── +1: FVG (dalam 0.5% dari harga) ───────────────────── */
    try {
      if (A && A.SMC) {
        const fvgs = A.SMC.detectFVG(ohlcv);
        const threshold = price * 0.005;

        const nearFVG = fvgs.find(fvg =>
          !fvg.filled &&
          Math.abs(fvg.midpoint - price) < threshold
        );
        if (nearFVG) {
          result.breakdown.fvg = 1;
          const dir = nearFVG.type === 'bullish' ? 'buy' : 'sell';
          if (dir === 'buy') bullPoints += 1;
          else bearPoints += 1;
          result.details.push({
            method: 'Fair Value Gap',
            signal: dir, points: 1,
            note: `${nearFVG.type} FVG @ ${nearFVG.bottom.toFixed(5)}–${nearFVG.top.toFixed(5)}`,
          });
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: BOS / CHoCH terkonfirmasi ─────────────────────── */
    try {
      if (A && A.SMC) {
        const bosArr  = A.SMC.detectBOS(ohlcv);
        const chochArr= A.SMC.detectCHoCH(ohlcv);
        const allBos  = [...bosArr, ...chochArr];

        if (allBos.length > 0) {
          // Ambil yang paling baru
          const latest = allBos.reduce((a, b) => (a.index > b.index ? a : b));
          result.breakdown.bos = 1;
          if (latest.type === 'bullish') {
            bullPoints += 1;
            result.details.push({
              method: latest.label || 'BOS/CHoCH',
              signal: 'buy', points: 1,
              note: `Bullish struktur break @ ${latest.price.toFixed(5)}`,
            });
          } else {
            bearPoints += 1;
            result.details.push({
              method: latest.label || 'BOS/CHoCH',
              signal: 'sell', points: 1,
              note: `Bearish struktur break @ ${latest.price.toFixed(5)}`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +2: Fibonacci Golden Pocket (61.8–65%) ─────────────── */
    try {
      if (A && A.Fibonacci) {
        const fib = A.Fibonacci.autoFib(ohlcv);
        if (fib && fib.retracement) {
          const gp = fib.retracement.filter(r => r.isGoldenPocket);
          if (gp.length >= 2) {
            const gpTop    = Math.max(...gp.map(r => r.price));
            const gpBottom = Math.min(...gp.map(r => r.price));
            const tolerance = (gpTop - gpBottom) * 0.5 + _getATR(ohlcv, 14) * 0.3;

            if (price >= gpBottom - tolerance && price <= gpTop + tolerance) {
              result.breakdown.fibonacci = 2;
              const dir = fib.trend === 'bullish' ? 'buy' : 'sell';
              if (dir === 'buy') bullPoints += 2;
              else bearPoints += 2;
              result.details.push({
                method: 'Fibonacci Golden Pocket',
                signal: dir, points: 2,
                note: `GP zone ${gpBottom.toFixed(5)}–${gpTop.toFixed(5)} (61.8–65%)`,
              });
            }
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: Candlestick Pattern sesuai arah ─────────────────── */
    try {
      if (A && A.PriceAction) {
        const patterns = A.PriceAction.detectCandlePatterns(ohlcv);
        // Ambil pattern di 3 candle terakhir
        const recent = patterns.filter(p => p.index >= ohlcv.length - 3);
        if (recent.length > 0) {
          // Ambil dengan accuracy tertinggi
          const best = recent.reduce((a, b) => (a.accuracy > b.accuracy ? a : b));
          if (best.type !== 'neutral') {
            result.breakdown.candlePattern = 1;
            if (best.type === 'bullish') {
              bullPoints += 1;
              result.details.push({
                method: best.name, signal: 'buy', points: 1,
                note: `Accuracy ${best.accuracy}%`,
              });
            } else {
              bearPoints += 1;
              result.details.push({
                method: best.name, signal: 'sell', points: 1,
                note: `Accuracy ${best.accuracy}%`,
              });
            }
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: RSI Oversold / Overbought ──────────────────────── */
    try {
      if (I && I.calcRSI) {
        const closes = ohlcv.map(c => c.close);
        const rsiArr = I.calcRSI(closes, 14);
        const rsi    = rsiArr[rsiArr.length - 1];

        if (!isNaN(rsi)) {
          const cfg = (window.CONFIG && window.CONFIG.INDICATOR_DEFAULTS &&
                       window.CONFIG.INDICATOR_DEFAULTS.RSI) || {};
          const ob = cfg.overbought || 70;
          const os = cfg.oversold   || 30;

          if (rsi <= os) {
            result.breakdown.rsi = 1;
            bullPoints += 1;
            result.details.push({
              method: 'RSI Oversold', signal: 'buy', points: 1,
              note: `RSI = ${rsi.toFixed(1)} (oversold < ${os})`,
            });
          } else if (rsi >= ob) {
            result.breakdown.rsi = 1;
            bearPoints += 1;
            result.details.push({
              method: 'RSI Overbought', signal: 'sell', points: 1,
              note: `RSI = ${rsi.toFixed(1)} (overbought > ${ob})`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: MACD Crossover ──────────────────────────────────── */
    try {
      if (I && I.calcMACD) {
        const closes   = ohlcv.map(c => c.close);
        const macdRes  = I.calcMACD(closes, 12, 26, 9);
        const n        = macdRes.histogram.length;
        const histNow  = macdRes.histogram[n - 1];
        const histPrev = macdRes.histogram[n - 2];
        const macdNow  = macdRes.macd[n - 1];
        const sigNow   = macdRes.signal[n - 1];
        const macdPrev = macdRes.macd[n - 2];
        const sigPrev  = macdRes.signal[n - 2];

        // Bullish crossover: macd crosses above signal
        if (!isNaN(macdNow) && !isNaN(sigNow) &&
            !isNaN(macdPrev) && !isNaN(sigPrev)) {
          const crossedUp   = macdNow > sigNow && macdPrev <= sigPrev;
          const crossedDown = macdNow < sigNow && macdPrev >= sigPrev;

          if (crossedUp || (!isNaN(histNow) && !isNaN(histPrev) && histNow > 0 && histPrev <= 0)) {
            result.breakdown.macd = 1;
            bullPoints += 1;
            result.details.push({
              method: 'MACD Bullish Cross', signal: 'buy', points: 1,
              note: `MACD(${macdNow.toFixed(5)}) > Signal(${sigNow.toFixed(5)})`,
            });
          } else if (crossedDown || (!isNaN(histNow) && !isNaN(histPrev) && histNow < 0 && histPrev >= 0)) {
            result.breakdown.macd = 1;
            bearPoints += 1;
            result.details.push({
              method: 'MACD Bearish Cross', signal: 'sell', points: 1,
              note: `MACD(${macdNow.toFixed(5)}) < Signal(${sigNow.toFixed(5)})`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: ICT Killzone Aktif ──────────────────────────────── */
    try {
      if (A && A.ICT) {
        const kz = A.ICT.getKillzoneStatus();
        if (kz.isActive) {
          result.breakdown.killzone = 1;
          // Killzone aktif menambah konfluensi ke arah bias harian
          const bias = A.ICT.getDailyBias(ohlcv);
          if (bias.bias === 'bullish') {
            bullPoints += 1;
            result.details.push({
              method: `ICT Killzone: ${kz.name}`,
              signal: 'buy', points: 1,
              note: `Aktif saat ini + Daily Bias Bullish`,
            });
          } else if (bias.bias === 'bearish') {
            bearPoints += 1;
            result.details.push({
              method: `ICT Killzone: ${kz.name}`,
              signal: 'sell', points: 1,
              note: `Aktif saat ini + Daily Bias Bearish`,
            });
          } else {
            // Killzone aktif saja sudah +0.5, bulatkan ke 1 untuk buy bias default
            bullPoints += 0.5;
            bearPoints += 0.5;
            result.details.push({
              method: `ICT Killzone: ${kz.name}`,
              signal: 'neutral', points: 1,
              note: `Killzone aktif, bias netral`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: Wyckoff Spring / Upthrust ──────────────────────── */
    try {
      if (A && A.Wyckoff) {
        const wyck = A.Wyckoff.detectPhase(ohlcv);
        if (wyck.phase === 'accumulation' && wyck.confidence >= 60) {
          result.breakdown.wyckoff = 1;
          bullPoints += 1;
          result.details.push({
            method: 'Wyckoff Accumulation',
            signal: 'buy', points: 1,
            note: `Phase ${wyck.subPhase} — ${wyck.confidence}% confidence`,
          });
        } else if (wyck.phase === 'distribution' && wyck.confidence >= 60) {
          result.breakdown.wyckoff = 1;
          bearPoints += 1;
          result.details.push({
            method: 'Wyckoff Distribution',
            signal: 'sell', points: 1,
            note: `Phase ${wyck.subPhase} — ${wyck.confidence}% confidence`,
          });
        } else if (wyck.phase === 'markup') {
          result.breakdown.wyckoff = 1;
          bullPoints += 1;
          result.details.push({
            method: 'Wyckoff Markup',
            signal: 'buy', points: 1,
            note: `Trend naik aktif — ${wyck.confidence}% confidence`,
          });
        } else if (wyck.phase === 'markdown') {
          result.breakdown.wyckoff = 1;
          bearPoints += 1;
          result.details.push({
            method: 'Wyckoff Markdown',
            signal: 'sell', points: 1,
            note: `Trend turun aktif — ${wyck.confidence}% confidence`,
          });
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: Harmonic Pattern PRZ Aktif ─────────────────────── */
    try {
      if (A && A.Harmonic) {
        const harmonics = A.Harmonic.detectPatterns(ohlcv);
        const activePRZ = harmonics.find(h => h.isActive && h.confidence >= 60);
        if (activePRZ) {
          result.breakdown.harmonic = 1;
          if (activePRZ.direction === 'bullish') {
            bullPoints += 1;
            result.details.push({
              method: `Harmonic: ${activePRZ.name}`,
              signal: 'buy', points: 1,
              note: `PRZ ${activePRZ.PRZ.bottom.toFixed(5)}–${activePRZ.PRZ.top.toFixed(5)} (${activePRZ.confidence}%)`,
            });
          } else {
            bearPoints += 1;
            result.details.push({
              method: `Harmonic: ${activePRZ.name}`,
              signal: 'sell', points: 1,
              note: `PRZ ${activePRZ.PRZ.bottom.toFixed(5)}–${activePRZ.PRZ.top.toFixed(5)} (${activePRZ.confidence}%)`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +1: Elliott Wave (wave 2 atau 4 / akhir koreksi) ────── */
    try {
      if (A && A.Elliott) {
        const ew = A.Elliott.detectWaves(ohlcv);
        if (ew && ew.isValid && ew.projection) {
          // Di akhir 5-wave bullish → antisipasi koreksi bearish
          if (ew.currentWave === 5 && ew.direction === 'bullish') {
            result.breakdown.elliott = 1;
            bearPoints += 1;
            result.details.push({
              method: 'Elliott Wave 5 Complete',
              signal: 'sell', points: 1,
              note: `Koreksi ABC kemungkinan dimulai. Target: ${ew.projection.target1.toFixed(5)}`,
            });
          }
          // Di akhir 5-wave bearish → antisipasi bounce bullish
          else if (ew.currentWave === 5 && ew.direction === 'bearish') {
            result.breakdown.elliott = 1;
            bullPoints += 1;
            result.details.push({
              method: 'Elliott Wave 5 Complete',
              signal: 'buy', points: 1,
              note: `Rebound ABC kemungkinan dimulai. Target: ${ew.projection.target1.toFixed(5)}`,
            });
          }
        }
      }
    } catch (e) { /* silent */ }

    /* ── +2: SMC Premium/Discount Alignment ─────────────────── */
    try {
      if (A && A.SMC) {
        const structure = A.SMC.getMarketStructure(ohlcv);
        const highs = ohlcv.map(c => c.high);
        const lows  = ohlcv.map(c => c.low);
        const swingH = Math.max(...highs.slice(-50));
        const swingL = Math.min(...lows.slice(-50));
        const pd     = A.SMC.detectPremiumDiscount(swingH, swingL, price);

        // Alignment: discount zone + uptrend = strong buy
        if (pd.zone === 'discount' && structure.trend === 'uptrend') {
          result.breakdown.premiumDiscount = 2;
          bullPoints += 2;
          result.details.push({
            method: 'SMC: Discount + Uptrend',
            signal: 'buy', points: 2,
            note: `${pd.percentage}% di range — Discount zone dalam uptrend`,
          });
        }
        // Premium zone + downtrend = strong sell
        else if (pd.zone === 'premium' && structure.trend === 'downtrend') {
          result.breakdown.premiumDiscount = 2;
          bearPoints += 2;
          result.details.push({
            method: 'SMC: Premium + Downtrend',
            signal: 'sell', points: 2,
            note: `${pd.percentage}% di range — Premium zone dalam downtrend`,
          });
        }
        // Partial alignment: 1 poin
        else if (pd.zone === 'discount' || structure.trend === 'uptrend') {
          result.breakdown.premiumDiscount = 1;
          bullPoints += 1;
          result.details.push({
            method: 'SMC: Discount/Uptrend (partial)',
            signal: 'buy', points: 1,
            note: `${pd.percentage}% — ${pd.zone} / ${structure.trend}`,
          });
        }
        else if (pd.zone === 'premium' || structure.trend === 'downtrend') {
          result.breakdown.premiumDiscount = 1;
          bearPoints += 1;
          result.details.push({
            method: 'SMC: Premium/Downtrend (partial)',
            signal: 'sell', points: 1,
            note: `${pd.percentage}% — ${pd.zone} / ${structure.trend}`,
          });
        }
      }
    } catch (e) { /* silent */ }

    /* ── Hitung total & tentukan arah ──────────────────────── */
    const total = Math.min(20, Math.round(bullPoints + bearPoints));
    result.total = total;

    // Tentukan arah berdasarkan dominansi
    if (bullPoints > bearPoints + 1)       result.direction = 'buy';
    else if (bearPoints > bullPoints + 1)  result.direction = 'sell';
    else                                   result.direction = 'neutral';

    // Tentukan kekuatan sinyal
    const effScore = result.direction === 'buy'
      ? bullPoints
      : result.direction === 'sell'
        ? bearPoints
        : Math.max(bullPoints, bearPoints);

    if (effScore >= 8)       result.strength = 'extreme';
    else if (effScore >= 5)  result.strength = 'high';
    else if (effScore >= 3)  result.strength = 'medium';
    else                     result.strength = 'low';

    result.bullPoints = _fmt(bullPoints, 1);
    result.bearPoints = _fmt(bearPoints, 1);

    return result;
  }


  /* ═══════════════════════════════════════════════════════════
     2. TRADE SETUP GENERATOR
     Menghasilkan entry, SL, TP, dan probabilitas trade
  ═══════════════════════════════════════════════════════════ */

  /**
   * generateTradeSetup(symbol, ohlcv)
   * Kalkulasi level entry, stop loss, dan take profit otomatis
   *
   * @param {string} symbol
   * @param {Array}  ohlcv
   * @returns {Object} trade setup lengkap
   */
  function generateTradeSetup(symbol, ohlcv) {
    const empty = {
      symbol, direction: 'neutral', confluenceScore: 0,
      entry: null, sl: null, tp1: null, tp2: null, tp3: null,
      slPips: 0, tp1Pips: 0, tp2Pips: 0, tp3Pips: 0,
      rr1: 0, rr2: 0, rr3: 0,
      probability: 0, methods: [], valid: false,
    };

    if (_guard(ohlcv, 30)) return empty;

    const lastClose = ohlcv[ohlcv.length - 1].close;
    const atr       = _getATR(ohlcv, 14);

    if (atr <= 0) return empty;

    // Hitung confluensi
    const conf = calcConfluenceScore(ohlcv, lastClose, symbol);
    if (conf.direction === 'neutral' || conf.strength === 'low') {
      return { ...empty, confluenceScore: conf.total, direction: conf.direction };
    }

    const A   = _A();
    let entry = lastClose;

    /* ── Tentukan Entry terbaik ── */
    // Prioritas: OB terbaru → FVG midpoint → Fibonacci level → harga sekarang
    if (A && A.SMC) {
      try {
        const obs = A.SMC.detectOrderBlocks(ohlcv);
        const nearOB = obs.find(ob =>
          !ob.mitigated &&
          ob.type === (conf.direction === 'buy' ? 'bullish' : 'bearish') &&
          Math.abs(((ob.high + ob.low) / 2) - lastClose) < atr * 3
        );
        if (nearOB) {
          entry = conf.direction === 'buy' ? nearOB.high : nearOB.low;
        }
      } catch (e) { /* silent */ }

      try {
        const fvgs = A.SMC.detectFVG(ohlcv);
        const nearFVG = fvgs.find(f =>
          !f.filled &&
          f.type === (conf.direction === 'buy' ? 'bullish' : 'bearish') &&
          Math.abs(f.midpoint - lastClose) < atr * 2
        );
        if (nearFVG && !entry) {
          entry = nearFVG.midpoint;
        }
      } catch (e) { /* silent */ }
    }

    /* ── Hitung SL ── */
    // SL = ATR × 1.5 di bawah entry (buy) atau di atas entry (sell)
    // Tambahan buffer: swing low/high terdekat
    let slDistance = atr * 1.5;

    if (A && A.Fibonacci) {
      try {
        const fib = A.Fibonacci.autoFib(ohlcv);
        if (fib) {
          // Gunakan level fib untuk SL minimum
          const level100 = fib.retracement.find(r => r.level === 1.0);
          if (level100) {
            const fibSLDist = Math.abs(entry - level100.price);
            if (fibSLDist > slDistance && fibSLDist < atr * 4) {
              slDistance = fibSLDist + atr * 0.2; // buffer sedikit di luar level 100%
            }
          }
        }
      } catch (e) { /* silent */ }
    }

    const sl  = conf.direction === 'buy'
      ? entry - slDistance
      : entry + slDistance;

    /* ── Hitung TP (RR berbasis) ── */
    const tp1 = conf.direction === 'buy'
      ? entry + slDistance * 1.0   // RR 1:1
      : entry - slDistance * 1.0;

    const tp2 = conf.direction === 'buy'
      ? entry + slDistance * 2.0   // RR 1:2
      : entry - slDistance * 2.0;

    const tp3 = conf.direction === 'buy'
      ? entry + slDistance * 4.0   // RR 1:4
      : entry - slDistance * 4.0;

    /* ── Hitung pips ── */
    const slPips   = _toPips(Math.abs(entry - sl), symbol);
    const tp1Pips  = _toPips(Math.abs(tp1 - entry), symbol);
    const tp2Pips  = _toPips(Math.abs(tp2 - entry), symbol);
    const tp3Pips  = _toPips(Math.abs(tp3 - entry), symbol);

    const rr1 = slPips > 0 ? +(tp1Pips / slPips).toFixed(2) : 0;
    const rr2 = slPips > 0 ? +(tp2Pips / slPips).toFixed(2) : 0;
    const rr3 = slPips > 0 ? +(tp3Pips / slPips).toFixed(2) : 0;

    /* ── Probabilitas ── */
    // (confluenceScore / 20) × 100 × 0.85 — cap 85%
    const probability = Math.min(85, +((conf.total / 20) * 100 * 0.85).toFixed(1));

    /* ── Metode yang berkontribusi ── */
    const methods = conf.details.filter(d =>
      d.signal === conf.direction || d.signal === 'neutral'
    ).map(d => d.method);

    const dec = symbol && (symbol.includes('JPY') || symbol.endsWith('USDT'))
      ? (symbol.endsWith('USDT') ? 2 : 3)
      : 5;

    return {
      symbol,
      direction:       conf.direction,
      confluenceScore: conf.total,
      strength:        conf.strength,
      entry:           _fmt(entry, dec),
      sl:              _fmt(sl, dec),
      tp1:             _fmt(tp1, dec),
      tp2:             _fmt(tp2, dec),
      tp3:             _fmt(tp3, dec),
      slPips:          +slPips.toFixed(1),
      tp1Pips:         +tp1Pips.toFixed(1),
      tp2Pips:         +tp2Pips.toFixed(1),
      tp3Pips:         +tp3Pips.toFixed(1),
      rr1, rr2, rr3,
      probability,
      methods,
      atr:             _fmt(atr, dec),
      breakdown:       conf.breakdown,
      details:         conf.details,
      valid:           true,
      timestamp:       Date.now(),
    };
  }


  /* ═══════════════════════════════════════════════════════════
     3. MULTI-TIMEFRAME ANALYSIS
     Analisis konfluensi di semua timeframe sekaligus
  ═══════════════════════════════════════════════════════════ */

  /**
   * getMTFAnalysis(symbol)
   * Analisis dari M1 hingga D1 menggunakan data di AppState.ohlcv
   * Setiap timeframe dianalisis secara mandiri dan penuh
   *
   * @param {string} symbol
   * @returns {Object} { timeframes[], alignmentScore, overallBias, recommendation }
   */
  function getMTFAnalysis(symbol) {
    const TF_LIST = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    const A = _A();
    const I = _I();

    const results      = [];
    let   bullCount    = 0;
    let   bearCount    = 0;
    let   neutralCount = 0;

    TF_LIST.forEach(tf => {
      const ohlcv = _getOHLCV(symbol, tf);

      // Jika data tidak ada di AppState, tandai sebagai 'no data'
      if (!ohlcv || ohlcv.length < 20) {
        results.push({
          timeframe: tf,
          label:     (window.CONFIG && window.CONFIG.TIMEFRAMES &&
                      window.CONFIG.TIMEFRAMES[tf]) ?
                      window.CONFIG.TIMEFRAMES[tf].label : tf,
          hasData:   false,
          trend:     'unknown',
          signal:    'neutral',
          smc:       null,
          fib:       null,
          indicators: null,
          confluence: 0,
          note:      'Data belum dimuat. Pilih TF ini pada chart untuk memuat data.',
        });
        neutralCount++;
        return;
      }

      const last  = ohlcv[ohlcv.length - 1];
      const price = last.close;
      let   tfResult = {
        timeframe: tf,
        label:     (window.CONFIG && window.CONFIG.TIMEFRAMES &&
                    window.CONFIG.TIMEFRAMES[tf]) ?
                    window.CONFIG.TIMEFRAMES[tf].label : tf,
        hasData:   true,
        price,
        candleCount: ohlcv.length,
      };

      /* ── Trend dari struktur market ── */
      try {
        if (A && A.SMC) {
          const ms = A.SMC.getMarketStructure(ohlcv);
          tfResult.trend = ms.trend;
          tfResult.marketStructure = ms;
        } else {
          // Fallback: EMA trend
          if (I && I.calcEMA) {
            const closes = ohlcv.map(c => c.close);
            const ema20  = I.calcEMA(closes, 20);
            const ema50  = I.calcEMA(closes, 50);
            const e20    = ema20[ema20.length - 1];
            const e50    = ema50[ema50.length - 1];
            if (!isNaN(e20) && !isNaN(e50)) {
              tfResult.trend = price > e20 && e20 > e50 ? 'uptrend' :
                               price < e20 && e20 < e50 ? 'downtrend' : 'ranging';
            } else {
              tfResult.trend = 'ranging';
            }
          }
        }
      } catch (e) { tfResult.trend = 'ranging'; }

      /* ── SMC Analysis ── */
      try {
        if (A && A.SMC) {
          const obs  = A.SMC.detectOrderBlocks(ohlcv);
          const fvgs = A.SMC.detectFVG(ohlcv);
          const bos  = A.SMC.detectBOS(ohlcv);
          const pd   = A.SMC.detectPremiumDiscount(
            Math.max(...ohlcv.slice(-50).map(c => c.high)),
            Math.min(...ohlcv.slice(-50).map(c => c.low)),
            price
          );

          tfResult.smc = {
            orderBlocks:    obs.slice(-3),
            fvg:            fvgs.slice(-3),
            bos:            bos.slice(-2),
            premiumDiscount: pd,
            activeOB:       obs.filter(ob => !ob.mitigated).length,
          };
        }
      } catch (e) { tfResult.smc = null; }

      /* ── Fibonacci ── */
      try {
        if (A && A.Fibonacci) {
          const fib = A.Fibonacci.autoFib(ohlcv);
          tfResult.fib = fib ? {
            swingHigh: _fmt(fib.swingHigh, 5),
            swingLow:  _fmt(fib.swingLow, 5),
            trend:     fib.trend,
            goldenPocket: fib.retracement.filter(r => r.isGoldenPocket).map(r => ({
              level: r.level, price: _fmt(r.price, 5)
            })),
          } : null;
        }
      } catch (e) { tfResult.fib = null; }

      /* ── Indicator Signals ── */
      try {
        if (I && I.getSignals) {
          const sig = I.getSignals(ohlcv);
          tfResult.indicators = {
            rsi:     sig.rsi,
            macd:    sig.macd,
            ma:      sig.ma,
            bb:      sig.bb,
            stoch:   sig.stoch,
            ema20:   _fmt(sig.ema20, 5),
            ema50:   _fmt(sig.ema50, 5),
            ema200:  _fmt(sig.ema200, 5),
            atr:     _fmt(sig.atr, 5),
            overall: sig.overall,
          };
        }
      } catch (e) { tfResult.indicators = null; }

      /* ── Confluence Score per TF ── */
      try {
        const conf = calcConfluenceScore(ohlcv, price, symbol);
        tfResult.confluence = conf.total;
        tfResult.signal     = conf.direction;
        tfResult.strength   = conf.strength;
        tfResult.breakdown  = conf.breakdown;
      } catch (e) {
        tfResult.confluence = 0;
        tfResult.signal     = 'neutral';
      }

      /* ── Hitung statistik arah ── */
      if (tfResult.signal === 'buy')    bullCount++;
      else if (tfResult.signal === 'sell') bearCount++;
      else                                  neutralCount++;

      results.push(tfResult);
    });

    /* ── Alignment Score & Overall Bias ── */
    const totalTF       = results.filter(r => r.hasData).length;
    const alignmentScore = totalTF > 0
      ? Math.round((Math.max(bullCount, bearCount) / totalTF) * 100)
      : 0;

    let overallBias;
    if (bullCount > bearCount + 1)       overallBias = 'bullish';
    else if (bearCount > bullCount + 1)  overallBias = 'bearish';
    else                                  overallBias = 'neutral';

    /* ── Recommendation berdasarkan alignment ── */
    let recommendation;
    if (alignmentScore >= 80) {
      recommendation = `${alignmentScore}% TF aligned ${overallBias.toUpperCase()} — Setup sangat kuat, peluang tinggi`;
    } else if (alignmentScore >= 60) {
      recommendation = `${alignmentScore}% TF aligned ${overallBias.toUpperCase()} — Setup cukup baik, konfirmasi di TF rendah`;
    } else if (alignmentScore >= 40) {
      recommendation = `Alignment moderat (${alignmentScore}%) — Mixed signal, tunggu konfirmasi lebih`;
    } else {
      recommendation = `Alignment lemah (${alignmentScore}%) — Pasar ranging atau conflicting, hindari entry`;
    }

    /* ── Higher TF Bias (H4 & D1 untuk konfirmasi) ── */
    const h4Result = results.find(r => r.timeframe === 'H4');
    const d1Result = results.find(r => r.timeframe === 'D1');
    const htfBias  = {
      H4: h4Result ? { trend: h4Result.trend, signal: h4Result.signal } : null,
      D1: d1Result ? { trend: d1Result.trend, signal: d1Result.signal } : null,
      aligned: h4Result && d1Result &&
               h4Result.signal === d1Result.signal &&
               h4Result.signal !== 'neutral',
    };

    return {
      symbol,
      timeframes:     results,
      bullCount,
      bearCount,
      neutralCount,
      alignmentScore,
      overallBias,
      recommendation,
      htfBias,
      timestamp:      Date.now(),
    };
  }


  /* ═══════════════════════════════════════════════════════════
     4. INDICATOR SUMMARY
     Ringkasan sinyal dari semua indikator teknikal
  ═══════════════════════════════════════════════════════════ */

  /**
   * getIndicatorSummary(ohlcv)
   * Merangkum sinyal buy/sell/neutral dari semua indikator
   *
   * @param {Array} ohlcv
   * @returns {Object} { trend, momentum, volume, volatility, overall }
   */
  function getIndicatorSummary(ohlcv) {
    const empty = {
      trend:      { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] },
      momentum:   { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] },
      volume:     { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] },
      volatility: { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] },
      overall:    { direction: 'neutral', strength: 'low', score: 0 },
    };

    if (_guard(ohlcv, 30)) return empty;

    const I      = _I();
    if (!I)       return empty;

    const closes  = ohlcv.map(c => c.close);
    const highs   = ohlcv.map(c => c.high);
    const lows    = ohlcv.map(c => c.low);
    const volumes = ohlcv.map(c => c.volume || 0);
    const n       = closes.length;
    const price   = closes[n - 1];

    const trend      = { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] };
    const momentum   = { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] };
    const volume     = { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] };
    const volatility = { count_buy: 0, count_sell: 0, count_neutral: 0, signals: [] };

    function _addSig(cat, name, value, signal, note = '') {
      cat.signals.push({ name, value, signal, note });
      if (signal === 'BUY' || signal === 'buy')          cat.count_buy++;
      else if (signal === 'SELL' || signal === 'sell')   cat.count_sell++;
      else                                                cat.count_neutral++;
    }

    /* ══ TREND INDICATORS ══ */

    // EMA 20/50/200
    try {
      const ema20  = I.calcEMA(closes, 20);
      const ema50  = I.calcEMA(closes, 50);
      const ema200 = I.calcEMA(closes, 200);
      const e20    = ema20[n - 1], e50 = ema50[n - 1], e200 = ema200[n - 1];

      if (!isNaN(e20) && !isNaN(e50)) {
        // EMA 20/50 cross
        const ema20Prev = ema20[n - 2], ema50Prev = ema50[n - 2];
        let emaSig = 'NEUTRAL';
        let emaNote = '';
        if (e20 > e50 && ema20Prev <= ema50Prev) { emaSig = 'BUY'; emaNote = 'EMA 20 cross above 50'; }
        else if (e20 < e50 && ema20Prev >= ema50Prev) { emaSig = 'SELL'; emaNote = 'EMA 20 cross below 50'; }
        else if (price > e20 && e20 > e50) { emaSig = 'BUY'; emaNote = 'Harga di atas EMA 20 & 50'; }
        else if (price < e20 && e20 < e50) { emaSig = 'SELL'; emaNote = 'Harga di bawah EMA 20 & 50'; }
        _addSig(trend, 'EMA 20/50', { e20: _fmt(e20, 5), e50: _fmt(e50, 5) }, emaSig, emaNote);
      }

      if (!isNaN(e200)) {
        const sig  = price > e200 ? 'BUY' : 'SELL';
        const note = price > e200 ? 'Harga di atas EMA 200 (bullish bias)' : 'Harga di bawah EMA 200 (bearish bias)';
        _addSig(trend, 'EMA 200', _fmt(e200, 5), sig, note);
      }
    } catch (e) { /* silent */ }

    // SMA 50/200
    try {
      const sma50  = I.calcSMA(closes, 50);
      const sma200 = I.calcSMA(closes, 200);
      const s50    = sma50[n - 1], s200 = sma200[n - 1];
      if (!isNaN(s50) && !isNaN(s200)) {
        const prev50 = sma50[n - 2], prev200 = sma200[n - 2];
        const goldCross = s50 > s200 && prev50 <= prev200;
        const deathCross = s50 < s200 && prev50 >= prev200;
        let sig = 'NEUTRAL', note = '';
        if (goldCross)  { sig = 'BUY';  note = 'Golden Cross SMA 50/200'; }
        else if (deathCross) { sig = 'SELL'; note = 'Death Cross SMA 50/200'; }
        else if (s50 > s200) { sig = 'BUY';  note = 'SMA 50 di atas SMA 200'; }
        else                  { sig = 'SELL'; note = 'SMA 50 di bawah SMA 200'; }
        _addSig(trend, 'SMA 50/200', { s50: _fmt(s50, 5), s200: _fmt(s200, 5) }, sig, note);
      }
    } catch (e) { /* silent */ }

    // MACD
    try {
      const macdRes  = I.calcMACD(closes, 12, 26, 9);
      const macdVal  = macdRes.macd[n - 1];
      const sigVal   = macdRes.signal[n - 1];
      const histVal  = macdRes.histogram[n - 1];
      const histPrev = macdRes.histogram[n - 2];
      if (!isNaN(macdVal) && !isNaN(sigVal)) {
        let sig = 'NEUTRAL', note = '';
        if (macdVal > sigVal && (!isNaN(histPrev) ? histPrev <= 0 : true)) {
          sig = 'BUY'; note = 'MACD bullish crossover';
        } else if (macdVal < sigVal && (!isNaN(histPrev) ? histPrev >= 0 : true)) {
          sig = 'SELL'; note = 'MACD bearish crossover';
        } else if (macdVal > sigVal) {
          sig = 'BUY'; note = 'MACD di atas signal line';
        } else {
          sig = 'SELL'; note = 'MACD di bawah signal line';
        }
        _addSig(trend, 'MACD', {
          macd: _fmt(macdVal, 6), signal: _fmt(sigVal, 6), histogram: _fmt(histVal, 6),
        }, sig, note);
      }
    } catch (e) { /* silent */ }

    // Parabolic SAR
    try {
      const sarRes = I.calcParabolicSAR(highs, lows, 0.02, 0.2);
      const sarVal = sarRes.sar[n - 1];
      const trend_ = sarRes.trend[n - 1];
      if (!isNaN(sarVal)) {
        const sig = trend_ === 'up' ? 'BUY' : 'SELL';
        _addSig(trend, 'Parabolic SAR', _fmt(sarVal, 5), sig,
          `SAR ${_fmt(sarVal, 5)} — trend ${trend_}`);
      }
    } catch (e) { /* silent */ }

    // Ichimoku
    try {
      const ichi = I.calcIchimoku(highs, lows, closes, 9, 26, 52);
      const tenkan = ichi.tenkan[n - 1], kijun = ichi.kijun[n - 1];
      const sA = ichi.senkouA[n - 1], sB = ichi.senkouB[n - 1];
      if (!isNaN(tenkan) && !isNaN(kijun)) {
        const cloudTop = !isNaN(sA) && !isNaN(sB) ? Math.max(sA, sB) : null;
        const cloudBot = !isNaN(sA) && !isNaN(sB) ? Math.min(sA, sB) : null;
        let sig = 'NEUTRAL', note = '';
        if (price > (cloudTop || kijun) && tenkan > kijun) {
          sig = 'BUY'; note = 'Di atas cloud, TK cross bullish';
        } else if (price < (cloudBot || kijun) && tenkan < kijun) {
          sig = 'SELL'; note = 'Di bawah cloud, TK cross bearish';
        }
        _addSig(trend, 'Ichimoku', { tenkan: _fmt(tenkan, 5), kijun: _fmt(kijun, 5) }, sig, note);
      }
    } catch (e) { /* silent */ }

    /* ══ MOMENTUM INDICATORS ══ */

    // RSI
    try {
      const rsiArr = I.calcRSI(closes, 14);
      const rsi    = rsiArr[n - 1];
      if (!isNaN(rsi)) {
        let sig = 'NEUTRAL', note = '';
        if (rsi < 30)      { sig = 'BUY';  note = `RSI oversold (${rsi.toFixed(1)})`;  }
        else if (rsi > 70) { sig = 'SELL'; note = `RSI overbought (${rsi.toFixed(1)})`; }
        else if (rsi < 45) { sig = 'SELL'; note = `RSI lemah (${rsi.toFixed(1)})`;  }
        else if (rsi > 55) { sig = 'BUY';  note = `RSI kuat (${rsi.toFixed(1)})`;   }
        else                { note = `RSI netral (${rsi.toFixed(1)})`; }
        _addSig(momentum, 'RSI (14)', _fmt(rsi, 2), sig, note);
      }
    } catch (e) { /* silent */ }

    // Stochastic
    try {
      const stoch = I.calcStochastic(highs, lows, closes, 14, 3, 3);
      const k     = stoch.k[n - 1], d = stoch.d[n - 1];
      if (!isNaN(k)) {
        let sig = 'NEUTRAL', note = '';
        const kPrev = stoch.k[n - 2], dPrev = stoch.d[n - 2];
        if (k < 20 && !isNaN(d) && k > d && (!isNaN(kPrev) && kPrev <= dPrev)) {
          sig = 'BUY'; note = `Stoch bullish cross di oversold (K=${k.toFixed(1)})`;
        } else if (k > 80 && !isNaN(d) && k < d && (!isNaN(kPrev) && kPrev >= dPrev)) {
          sig = 'SELL'; note = `Stoch bearish cross di overbought (K=${k.toFixed(1)})`;
        } else if (k < 20) {
          sig = 'BUY'; note = `Stoch oversold (K=${k.toFixed(1)})`;
        } else if (k > 80) {
          sig = 'SELL'; note = `Stoch overbought (K=${k.toFixed(1)})`;
        }
        _addSig(momentum, 'Stochastic (14,3,3)', { k: _fmt(k, 2), d: _fmt(d, 2) }, sig, note);
      }
    } catch (e) { /* silent */ }

    // Williams %R
    try {
      const wrArr = I.calcWilliamsR(highs, lows, closes, 14);
      const wr    = wrArr[n - 1];
      if (!isNaN(wr)) {
        let sig = 'NEUTRAL', note = '';
        if (wr < -80)      { sig = 'BUY';  note = `W%R oversold (${wr.toFixed(1)})`; }
        else if (wr > -20) { sig = 'SELL'; note = `W%R overbought (${wr.toFixed(1)})`; }
        _addSig(momentum, 'Williams %R (14)', _fmt(wr, 2), sig, note);
      }
    } catch (e) { /* silent */ }

    // CCI
    try {
      const cciArr = I.calcCCI(highs, lows, closes, 20);
      const cci    = cciArr[n - 1];
      if (!isNaN(cci)) {
        let sig = 'NEUTRAL', note = '';
        if (cci < -100)     { sig = 'BUY';  note = `CCI oversold (${cci.toFixed(1)})`;  }
        else if (cci > 100) { sig = 'SELL'; note = `CCI overbought (${cci.toFixed(1)})`; }
        _addSig(momentum, 'CCI (20)', _fmt(cci, 2), sig, note);
      }
    } catch (e) { /* silent */ }

    // Momentum (ROC)
    try {
      const momArr = I.calcMomentum(closes, 10);
      const mom    = momArr[n - 1];
      if (!isNaN(mom)) {
        const sig  = mom > 0 ? 'BUY' : mom < 0 ? 'SELL' : 'NEUTRAL';
        const note = `Momentum ${mom > 0 ? 'positif' : 'negatif'} (${mom.toFixed(5)})`;
        _addSig(momentum, 'Momentum (10)', _fmt(mom, 5), sig, note);
      }
    } catch (e) { /* silent */ }

    /* ══ VOLUME INDICATORS ══ */

    // OBV
    try {
      const obvArr  = I.calcOBV(closes, volumes);
      const obv     = obvArr[n - 1];
      const obvPrev = obvArr[n - 5] || obvArr[0];
      if (!isNaN(obv) && !isNaN(obvPrev)) {
        const trend_ = obv > obvPrev ? 'BUY' : obv < obvPrev ? 'SELL' : 'NEUTRAL';
        const note   = obv > obvPrev
          ? `OBV naik — distribusi akumulasi`
          : `OBV turun — distribusi bearish`;
        _addSig(volume, 'OBV', _fmt(obv, 0), trend_, note);
      }
    } catch (e) { /* silent */ }

    // Volume EMA
    try {
      const volEMA  = I.calcVolumeEMA(volumes, 20);
      const vema    = volEMA[n - 1];
      const currVol = volumes[n - 1];
      if (!isNaN(vema) && vema > 0) {
        const ratio = currVol / vema;
        const sig   = ratio >= 1.5 ? 'BUY' : ratio <= 0.5 ? 'SELL' : 'NEUTRAL';
        const note  = `Volume ${ratio.toFixed(1)}× dari rata-rata`;
        _addSig(volume, 'Volume (vs EMA)', _fmt(ratio, 2), sig, note);
      }
    } catch (e) { /* silent */ }

    /* ══ VOLATILITY INDICATORS ══ */

    // Bollinger Bands
    try {
      const bb = I.calcBollingerBands(closes, 20, 2);
      const bbU = bb.upper[n - 1], bbL = bb.lower[n - 1], bbM = bb.middle[n - 1];
      const bbW = bb.width[n - 1];
      if (!isNaN(bbU) && !isNaN(bbL)) {
        let sig = 'NEUTRAL', note = '';
        if (price <= bbL)       { sig = 'BUY';  note = `Harga menyentuh lower band — bounce potensial`; }
        else if (price >= bbU)  { sig = 'SELL'; note = `Harga menyentuh upper band — pullback potensial`; }
        else if (price > bbM)   { sig = 'BUY';  note = `Harga di atas BB midline`; }
        else                     { sig = 'SELL'; note = `Harga di bawah BB midline`; }
        _addSig(volatility, 'Bollinger Bands', {
          upper: _fmt(bbU, 5), middle: _fmt(bbM, 5), lower: _fmt(bbL, 5), width: _fmt(bbW, 2),
        }, sig, note);
      }
    } catch (e) { /* silent */ }

    // ATR
    try {
      const atrArr = I.calcATR(highs, lows, closes, 14);
      const atr    = atrArr[n - 1];
      const atrMA  = I.calcEMA(atrArr.filter(v => !isNaN(v)), 14);
      const atrAvg = atrMA[atrMA.length - 1];
      if (!isNaN(atr)) {
        const expanding = !isNaN(atrAvg) && atr > atrAvg * 1.2;
        const contracting = !isNaN(atrAvg) && atr < atrAvg * 0.8;
        const sig  = expanding ? 'BUY' : contracting ? 'SELL' : 'NEUTRAL';
        const note = expanding ? `Volatilitas meningkat (ATR: ${_fmt(atr, 5)})`
                   : contracting ? `Volatilitas menyempit — potensi breakout`
                   : `Volatilitas normal (ATR: ${_fmt(atr, 5)})`;
        _addSig(volatility, 'ATR (14)', _fmt(atr, 5), sig, note);
      }
    } catch (e) { /* silent */ }

    // Standard Deviation
    try {
      const sdArr = I.calcStdDev(closes, 20);
      const sd    = sdArr[n - 1];
      const sdPrev= sdArr[n - 6] || sdArr[0];
      if (!isNaN(sd)) {
        const expanding = sd > sdPrev * 1.3;
        const sig  = expanding ? 'SELL' : 'NEUTRAL'; // high std = uncertainty
        const note = expanding ? `StdDev meningkat — pasar volatile`
                               : `StdDev stabil (${_fmt(sd, 5)})`;
        _addSig(volatility, 'StdDev (20)', _fmt(sd, 5), sig, note);
      }
    } catch (e) { /* silent */ }

    /* ── Hitung Overall Score ── */
    const allSigs = [
      ...trend.signals,
      ...momentum.signals,
      ...volume.signals,
      ...volatility.signals,
    ];

    const buyCount    = allSigs.filter(s => s.signal === 'BUY').length;
    const sellCount   = allSigs.filter(s => s.signal === 'SELL').length;
    const totalSig    = allSigs.length;

    const netScore = totalSig > 0
      ? ((buyCount - sellCount) / totalSig) * 100
      : 0;

    let direction;
    if (netScore >= 40)       direction = 'STRONG BUY';
    else if (netScore >= 15)  direction = 'BUY';
    else if (netScore <= -40) direction = 'STRONG SELL';
    else if (netScore <= -15) direction = 'SELL';
    else                      direction = 'NEUTRAL';

    let strength;
    const abScore = Math.abs(netScore);
    if (abScore >= 60)       strength = 'extreme';
    else if (abScore >= 40)  strength = 'high';
    else if (abScore >= 20)  strength = 'medium';
    else                     strength = 'low';

    return {
      trend,
      momentum,
      volume,
      volatility,
      overall: {
        direction,
        strength,
        score:       +netScore.toFixed(1),
        buyCount,
        sellCount,
        neutralCount: totalSig - buyCount - sellCount,
        totalSignals: totalSig,
      },
    };
  }


  /* ═══════════════════════════════════════════════════════════
     5. ACTIVE SIGNALS SCANNER
     Scan semua instrumen di watchlist dan simpan ke AppState
  ═══════════════════════════════════════════════════════════ */

  /**
   * scanActiveSignals()
   * Scan semua simbol di AppState.watchlist, hasilkan sinyal aktif
   * Simpan ke AppState.activeSignals
   */
  function scanActiveSignals() {
    const state = window.AppState;
    if (!state) return [];

    const watchlist   = state.watchlist || ['BTCUSDT', 'ETHUSDT', 'XAUTUSDT'];
    const tf          = state.selectedTimeframe || 'H1';
    const signals     = [];

    watchlist.forEach(symbol => {
      const ohlcv = _getOHLCV(symbol, tf);
      if (!ohlcv || ohlcv.length < 30) return;

      const lastClose = ohlcv[ohlcv.length - 1].close;
      const conf      = calcConfluenceScore(ohlcv, lastClose, symbol);

      if (conf.direction !== 'neutral' && conf.strength !== 'low') {
        const setup = generateTradeSetup(symbol, ohlcv);
        signals.push({
          symbol,
          timeframe:  tf,
          direction:  conf.direction,
          strength:   conf.strength,
          score:      conf.total,
          entry:      setup.entry,
          sl:         setup.sl,
          tp1:        setup.tp1,
          tp2:        setup.tp2,
          probability: setup.probability,
          methods:    conf.details.slice(0, 3).map(d => d.method),
          timestamp:  Date.now(),
        });
      }
    });

    // Sort by score desc
    signals.sort((a, b) => b.score - a.score);

    if (state) state.activeSignals = signals;
    return signals;
  }


  /* ═══════════════════════════════════════════════════════════
     EXPORT — window.Signals
  ═══════════════════════════════════════════════════════════ */
  window.Signals = {
    calcConfluenceScore,
    generateTradeSetup,
    getMTFAnalysis,
    getIndicatorSummary,
    scanActiveSignals,

    /**
     * getQuickSignal(symbol, timeframe)
     * Helper cepat: ambil sinyal satu instrumen satu timeframe
     */
    getQuickSignal(symbol, timeframe) {
      const ohlcv = _getOHLCV(symbol, timeframe || 'H1');
      if (!ohlcv || ohlcv.length < 30) {
        return { symbol, timeframe, direction: 'neutral', score: 0, valid: false };
      }
      const price = ohlcv[ohlcv.length - 1].close;
      const conf  = calcConfluenceScore(ohlcv, price, symbol);
      return {
        symbol,
        timeframe: timeframe || 'H1',
        direction: conf.direction,
        strength:  conf.strength,
        score:     conf.total,
        breakdown: conf.breakdown,
        valid:     conf.direction !== 'neutral',
      };
    },

    /**
     * getFullAnalysis(symbol, timeframe)
     * Gabungan: confluence + trade setup + indicator summary
     */
    getFullAnalysis(symbol, timeframe) {
      const ohlcv = _getOHLCV(symbol, timeframe || 'H1');
      if (!ohlcv || ohlcv.length < 30) return null;
      const price = ohlcv[ohlcv.length - 1].close;

      return {
        symbol,
        timeframe:  timeframe || 'H1',
        price,
        confluence: calcConfluenceScore(ohlcv, price, symbol),
        tradeSetup: generateTradeSetup(symbol, ohlcv),
        indicators: getIndicatorSummary(ohlcv),
        mtf:        getMTFAnalysis(symbol),
        timestamp:  Date.now(),
      };
    },
  };

  console.log('[Signals] signals.js v3.0 loaded — Confluence/MTF/TradeSetup/IndicatorSummary ready');
})();
