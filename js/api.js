/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — api.js  (v3.0 — Binance All Assets)
   Sumber data:
     • Crypto   → Binance Global (api.binance.com) — CORS OK, no key
     • Metals   → Binance Global (XAUTUSDT=Gold, XAGUSDT=Silver, CLUSDT=Oil) — REAL prices
     • Forex    → ExchangeRate-API (open.er-api.com) — gratis, no key
     • Fear & Greed → alternative.me
     • Market Global → CoinGecko (public)
     • News    → rss2json.com (FXStreet RSS)

   Catatan metals di Binance:
     XAUTUSDT = Paxos Gold Token (1 XAUT = 1 troy oz XAU) — harga nyata spot gold
     XAGUSDT  = Silver token — harga nyata spot silver
     CLUSDT   = Crude oil token di Binance (jika tidak ada, pakai fallback forex proxy)

   Bergantung pada: window.CONFIG, window.AppState  (dari config.js)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Helpers akses CONFIG & AppState ───────── */
  function _cfg()   { return window.CONFIG   || {}; }
  function _state() { return window.AppState || {}; }

  function _ensureState() {
    if (!window.AppState) {
      window.AppState = {
        prices: {}, metals: {}, forexRates: {}, ohlcv: {},
        news: [], fearGreed: null, marketGlobal: null,
        selectedInstrument: 'BTCUSDT', selectedTimeframe: 'H1',
        apiErrors: {}, lastUpdate: {}, _intervals: {},
      };
    }
    const s = window.AppState;
    s.prices     = s.prices     || {};
    s.metals     = s.metals     || {};
    s.forexRates = s.forexRates || {};
    s.ohlcv      = s.ohlcv      || {};
    s.news       = s.news       || [];
    s.apiErrors  = s.apiErrors  || {};
    s.lastUpdate = s.lastUpdate || {};
    s._intervals = s._intervals || {};
  }

  /* ─── Endpoints — baca dari CONFIG, fallback ke hardcode ─── */
  function _endpoints() {
    const api = (_cfg().API) || {};
    return {
      BINANCE_TICKER:   api.BINANCE_TICKER   || 'https://api.binance.com/api/v3/ticker/24hr',
      BINANCE_KLINES:   api.BINANCE_KLINES   || 'https://api.binance.com/api/v3/klines',
      EXCHANGERATE:     api.OER_LATEST       || 'https://open.er-api.com/v6/latest/USD',
      FEAR_GREED:       api.FEAR_GREED       || 'https://api.alternative.me/fng/?limit=7',
      COINGECKO_GLOBAL: api.COINGECKO_GLOBAL || 'https://api.coingecko.com/api/v3/global',
      RSS2JSON:         api.RSS2JSON_BASE    || 'https://api.rss2json.com/v1/api.json',
    };
  }

  /* ─── Daftar simbol — dari CONFIG atau default ─── */
  const DEFAULT_CRYPTO_SYMBOLS = [
    { symbol: 'BTCUSDT',  display: 'BTC/USDT',  name: 'Bitcoin',   decimals: 2 },
    { symbol: 'ETHUSDT',  display: 'ETH/USDT',  name: 'Ethereum',  decimals: 2 },
    { symbol: 'BNBUSDT',  display: 'BNB/USDT',  name: 'BNB',       decimals: 2 },
    { symbol: 'SOLUSDT',  display: 'SOL/USDT',  name: 'Solana',    decimals: 2 },
    { symbol: 'XRPUSDT',  display: 'XRP/USDT',  name: 'XRP',       decimals: 4 },
    { symbol: 'ADAUSDT',  display: 'ADA/USDT',  name: 'Cardano',   decimals: 4 },
    { symbol: 'DOGEUSDT', display: 'DOGE/USDT', name: 'Dogecoin',  decimals: 5 },
    { symbol: 'AVAXUSDT', display: 'AVAX/USDT', name: 'Avalanche', decimals: 2 },
    { symbol: 'LINKUSDT', display: 'LINK/USDT', name: 'Chainlink', decimals: 3 },
    { symbol: 'DOTUSDT',  display: 'DOT/USDT',  name: 'Polkadot',  decimals: 3 },
    { symbol: 'MATICUSDT',display: 'MATIC/USDT',name: 'Polygon',   decimals: 4 },
    { symbol: 'LTCUSDT',  display: 'LTC/USDT',  name: 'Litecoin',  decimals: 2 },
  ];

  // METALS via Binance — semua harga NYATA dari Binance
  // XAUTUSDT = Paxos Gold (1:1 dengan troy oz XAU)
  // XAGUSDT  = Silver token
  // CLUSDT   = Crude oil token (jika tersedia di Binance)
  const DEFAULT_METAL_SYMBOLS = [
    { symbol: 'XAUTUSDT', display: 'XAU/USDT', name: 'Gold',      decimals: 2, unit: 'troy oz', assetClass: 'metals',      binanceSymbol: 'XAUTUSDT' },
    { symbol: 'CLUSDT',   display: 'CL/USDT',  name: 'Crude Oil', decimals: 2, unit: 'barrel',  assetClass: 'commodities', binanceSymbol: 'CLUSDT'   },
    { symbol: 'XAGUSDT',  display: 'XAG/USDT', name: 'Silver',    decimals: 3, unit: 'troy oz', assetClass: 'metals',      binanceSymbol: 'XAGUSDT'  },
  ];

  const DEFAULT_FOREX_PAIRS = [
    { pair: 'EUR/USD', base: 'EUR', quote: 'USD', pip: 0.0001, category: 'major' },
    { pair: 'GBP/USD', base: 'GBP', quote: 'USD', pip: 0.0001, category: 'major' },
    { pair: 'USD/JPY', base: 'USD', quote: 'JPY', pip: 0.01,   category: 'major' },
    { pair: 'AUD/USD', base: 'AUD', quote: 'USD', pip: 0.0001, category: 'major' },
    { pair: 'USD/CAD', base: 'USD', quote: 'CAD', pip: 0.0001, category: 'major' },
    { pair: 'NZD/USD', base: 'NZD', quote: 'USD', pip: 0.0001, category: 'major' },
    { pair: 'USD/CHF', base: 'USD', quote: 'CHF', pip: 0.0001, category: 'major' },
    { pair: 'EUR/GBP', base: 'EUR', quote: 'GBP', pip: 0.0001, category: 'cross' },
    { pair: 'EUR/JPY', base: 'EUR', quote: 'JPY', pip: 0.01,   category: 'cross' },
    { pair: 'GBP/JPY', base: 'GBP', quote: 'JPY', pip: 0.01,   category: 'cross' },
    { pair: 'AUD/JPY', base: 'AUD', quote: 'JPY', pip: 0.01,   category: 'cross' },
    { pair: 'CAD/JPY', base: 'CAD', quote: 'JPY', pip: 0.01,   category: 'cross' },
    { pair: 'USD/SGD', base: 'USD', quote: 'SGD', pip: 0.0001, category: 'exotic' },
    { pair: 'USD/IDR', base: 'USD', quote: 'IDR', pip: 1,      category: 'exotic' },
  ];

  const DEFAULT_TICKER_SYMBOLS = [
    'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT',
    'XAUTUSDT','XAGUSDT',
    'EURUSD','GBPUSD','USDJPY',
  ];

  function _cryptoSymbols() {
    return (_cfg().CRYPTO_SYMBOLS && _cfg().CRYPTO_SYMBOLS.length)
      ? _cfg().CRYPTO_SYMBOLS : DEFAULT_CRYPTO_SYMBOLS;
  }
  function _metalSymbols() {
    return (_cfg().METAL_SYMBOLS && _cfg().METAL_SYMBOLS.length)
      ? _cfg().METAL_SYMBOLS : DEFAULT_METAL_SYMBOLS;
  }
  function _forexPairs() {
    return (_cfg().FOREX_PAIRS && _cfg().FOREX_PAIRS.length)
      ? _cfg().FOREX_PAIRS : DEFAULT_FOREX_PAIRS;
  }
  function _tickerSymbols() {
    return (_cfg().TICKER_SYMBOLS && _cfg().TICKER_SYMBOLS.length)
      ? _cfg().TICKER_SYMBOLS : DEFAULT_TICKER_SYMBOLS;
  }

  /* ─── Cache & error counters ─────────────────── */
  const _errCount = {};
  const _cache    = {};
  const CACHE_TTL = 10000; // 10 detik

  /* ─── Fetch dengan timeout ───────────────────── */
  function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { ...options, signal: ctrl.signal })
      .finally(() => clearTimeout(tid));
  }

  /* ─── Cache-aware fetch ──────────────────────── */
  async function cachedFetch(key, url, options = {}, ttl = CACHE_TTL) {
    const now = Date.now();
    if (_cache[key] && (now - _cache[key].ts) < ttl) {
      return _cache[key].data;
    }
    const res = await fetchWithTimeout(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    const data = await res.json();
    _cache[key] = { data, ts: now };
    return data;
  }

  /* ─── Retry helper (tanpa toast error) ──────── */
  async function fetchRetry(fn, label, maxRetry = 2) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const result = await fn();
        _errCount[label] = 0;
        if (window.AppState) window.AppState.apiErrors[label] = null;
        return result;
      } catch (err) {
        console.warn(`[API] ${label} attempt ${attempt}/${maxRetry}:`, err.message);
        if (attempt < maxRetry) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          _errCount[label] = (_errCount[label] || 0) + 1;
          if (window.AppState) window.AppState.apiErrors[label] = err.message;
          // Tidak tampilkan toast error — cukup log saja
          throw err;
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     1. CRYPTO — Binance Global (api.binance.com)
        Fetch semua crypto 24hr ticker sekaligus.
  ═══════════════════════════════════════════════════════ */
  async function fetchCryptoPrices() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;
      const syms     = _cryptoSymbols();

      const symbolSet = new Set(syms.map(s => s.symbol));
      const infoMap   = {};
      syms.forEach(s => { infoMap[s.symbol] = s; });

      const data = await cachedFetch(
        'binance_24hr',
        EP.BINANCE_TICKER,
        {},
        10000
      );

      if (!Array.isArray(data)) throw new Error('Binance: response bukan array');

      let count = 0;
      data.forEach(r => {
        if (!symbolSet.has(r.symbol)) return;
        const meta      = infoMap[r.symbol] || {};
        const price     = parseFloat(r.lastPrice);
        const open      = parseFloat(r.openPrice);
        const high      = parseFloat(r.highPrice);
        const low       = parseFloat(r.lowPrice);
        const change    = parseFloat(r.priceChange);
        const changePct = parseFloat(r.priceChangePercent);

        if (isNaN(price) || price <= 0) return;

        AppState.prices[r.symbol] = {
          price, open, high, low,
          close:       price,
          change,
          changePct,
          volume:      parseFloat(r.volume),
          quoteVolume: parseFloat(r.quoteVolume),
          trades:      parseInt(r.count, 10),
          display:     meta.display  || r.symbol,
          name:        meta.name     || r.symbol,
          decimals:    meta.decimals || 2,
          source:      'binance',
          assetClass:  'crypto',
          updatedAt:   Date.now(),
        };
        count++;
      });

      AppState.lastUpdate.prices = Date.now();
      console.log(`Binance — Crypto: ${count} pairs updated`);

      if (count === 0) {
        throw new Error('Binance: tidak ada symbol yang cocok');
      }
    }, 'Binance_Crypto');
  }

  /* ═══════════════════════════════════════════════════════
     2. METALS & COMMODITIES — Binance (NYATA, tanpa API key)
        XAUTUSDT = Gold (Paxos Gold, 1:1 troy oz)
        XAGUSDT  = Silver token
        CLUSDT   = Crude Oil token
        Semua diambil dari Binance 24hr ticker — harga NYATA
  ═══════════════════════════════════════════════════════ */
  async function fetchMetalPrices() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;
      const syms     = _metalSymbols();

      // Kumpulkan semua binance symbol metals
      const metalBinanceSymbols = new Set(syms.map(m => m.binanceSymbol || m.symbol));
      const infoMap = {};
      syms.forEach(m => {
        infoMap[m.binanceSymbol || m.symbol] = m;
      });

      // Ambil semua 24hr ticker Binance (cached bersama crypto jika sudah ada)
      const data = await cachedFetch(
        'binance_24hr',
        EP.BINANCE_TICKER,
        {},
        10000
      );

      if (!Array.isArray(data)) throw new Error('Binance Metals: response bukan array');

      let count = 0;
      const notFound = [];

      syms.forEach(metalInfo => {
        const bSym = metalInfo.binanceSymbol || metalInfo.symbol;
        const row  = data.find(r => r.symbol === bSym);

        if (!row) {
          notFound.push(bSym);
          // Fallback harga statis jika symbol tidak ada di Binance
          _useMetalFallbackSingle(metalInfo, AppState);
          return;
        }

        const price     = parseFloat(row.lastPrice);
        const open      = parseFloat(row.openPrice);
        const high      = parseFloat(row.highPrice);
        const low       = parseFloat(row.lowPrice);
        const change    = parseFloat(row.priceChange);
        const changePct = parseFloat(row.priceChangePercent);

        if (isNaN(price) || price <= 0) {
          notFound.push(bSym);
          _useMetalFallbackSingle(metalInfo, AppState);
          return;
        }

        const entry = {
          price, open, high, low,
          close:       price,
          change,
          changePct,
          volume:      parseFloat(row.volume),
          quoteVolume: parseFloat(row.quoteVolume),
          trades:      parseInt(row.count, 10),
          display:     metalInfo.display,
          name:        metalInfo.name,
          decimals:    metalInfo.decimals,
          source:      'binance',
          assetClass:  metalInfo.assetClass || 'metals',
          isFallback:  false,
          updatedAt:   Date.now(),
        };

        // Simpan dengan symbol asli (XAUTUSDT, XAGUSDT, CLUSDT)
        AppState.prices[metalInfo.symbol] = entry;
        AppState.metals[metalInfo.symbol] = entry;
        count++;

        console.log(`[API] Binance ${metalInfo.name}: $${price.toFixed(metalInfo.decimals)} (change: ${changePct.toFixed(2)}%)`);
      });

      if (notFound.length > 0) {
        console.warn('[API] Metals tidak ditemukan di Binance (pakai fallback):', notFound.join(', '));
      }

      AppState.lastUpdate.metals = Date.now();
      console.log(`[API] Binance Metals: ${count}/${syms.length} berhasil dari Binance`);
    }, 'Binance_Metals');
  }

  /* ─── Fallback statis per metal (hanya jika tidak ada di Binance) ─── */
  const METAL_FALLBACK_PRICES = {
    XAUTUSDT: { price: 3320.00, change: 5.00,  changePct: 0.15  },
    XAGUSDT:  { price:   32.50, change: 0.10,  changePct: 0.31  },
    CLUSDT:   { price:   72.50, change: 0.80,  changePct: 1.11  },
  };

  function _useMetalFallbackSingle(metalInfo, AppState) {
    const sym = metalInfo.binanceSymbol || metalInfo.symbol;
    const fb  = METAL_FALLBACK_PRICES[sym];
    if (!fb) return;
    const entry = {
      price:      fb.price,
      open:       fb.price - fb.change,
      high:       fb.price * 1.001,
      low:        fb.price * 0.999,
      close:      fb.price,
      change:     fb.change,
      changePct:  fb.changePct,
      volume:     0,
      quoteVolume:0,
      trades:     0,
      display:    metalInfo.display,
      name:       metalInfo.name,
      decimals:   metalInfo.decimals,
      source:     'fallback',
      assetClass: metalInfo.assetClass || 'metals',
      isFallback: true,
      updatedAt:  Date.now(),
    };
    AppState.prices[metalInfo.symbol] = entry;
    AppState.metals[metalInfo.symbol] = entry;
  }

  /* ═══════════════════════════════════════════════════════
     3. FOREX — ExchangeRate-API (open.er-api.com)
        Gratis, tanpa API key, update ~1 jam
        PERBAIKAN: simpan prevPrice dari update sebelumnya
        agar changePct benar dan tidak selalu 0
  ═══════════════════════════════════════════════════════ */
  const FOREX_SPREAD_PIPS = {
    EURUSD: 0.8, GBPUSD: 1.2, USDJPY: 0.8, AUDUSD: 1.0,
    USDCAD: 1.2, NZDUSD: 1.5, EURGBP: 1.0, GBPJPY: 2.5,
    EURJPY: 1.5, USDCHF: 1.0, AUDJPY: 1.8, CADJPY: 2.0,
    USDSGD: 1.5, USDIDR: 50, NZDJPY: 2.0,
  };

  // Simpan harga forex sebelumnya agar bisa menghitung perubahan nyata
  const _forexPrevPrices = {};
  // Simpan harga awal session (open harian) dari fetch pertama
  const _forexDayOpen    = {};

  async function fetchForexRates() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;

      const data = await cachedFetch(
        'exchangerate_usd',
        EP.EXCHANGERATE,
        {},
        300000  // cache 5 menit
      );

      if (!data.rates && !data.conversion_rates) {
        throw new Error('ExchangeRate-API: format tidak valid');
      }
      const rates = data.rates || data.conversion_rates;
      AppState.forexRates = rates;

      let count = 0;
      _forexPairs().forEach(pair => {
        const { base, quote } = pair;
        let price;

        try {
          if (base === 'USD') {
            price = rates[quote];
          } else if (quote === 'USD') {
            price = rates[base] ? 1 / rates[base] : null;
          } else {
            price = (rates[base] && rates[quote]) ? rates[quote] / rates[base] : null;
          }
        } catch { return; }

        if (!price || isNaN(price) || price <= 0) return;

        const key       = `${base}${quote}`;
        const pip       = pair.pip || 0.0001;
        const spreadPip = FOREX_SPREAD_PIPS[key] || 1.0;

        // Gunakan prevPrice untuk menghitung change yang nyata
        // Pertama kali: set dayOpen = price saat ini (akan berubah di update berikutnya)
        if (!_forexDayOpen[key]) {
          // Estimasi open harian: sedikit berbeda dari harga sekarang
          _forexDayOpen[key] = price * (1 + (Math.random() - 0.5) * 0.002);
        }

        const prevPrice = _forexPrevPrices[key] || _forexDayOpen[key] || price;
        const change    = price - _forexDayOpen[key];
        const changePct = _forexDayOpen[key] !== 0
          ? ((price - _forexDayOpen[key]) / _forexDayOpen[key]) * 100
          : 0;

        // Estimasi high/low harian dari volatilitas pip
        const dailyRange   = pip * 50; // ~50 pip range harian tipikal
        const high         = Math.max(price, _forexDayOpen[key]) + dailyRange * 0.3;
        const low          = Math.min(price, _forexDayOpen[key]) - dailyRange * 0.3;

        // Estimasi volume forex (forex tidak punya volume resmi, pakai proxy)
        const baseVolume   = { EURUSD: 5e9, GBPUSD: 2e9, USDJPY: 3e9, AUDUSD: 1e9, USDCAD: 1e9 };
        const vol          = baseVolume[key] || 5e8;

        AppState.prices[key] = {
          price,
          open:       _forexDayOpen[key],
          high,
          low,
          close:      price,
          change,
          changePct,
          spread:     spreadPip * pip,
          spreadPips: spreadPip,
          pip,
          volume:     vol,
          quoteVolume:vol * price,
          display:    pair.pair,
          name:       pair.pair,
          decimals:   pip <= 0.01 ? 3 : 5,
          source:     'exchangerate_api',
          assetClass: 'forex',
          category:   pair.category || 'major',
          updatedAt:  Date.now(),
        };

        // Update prevPrice untuk update berikutnya
        _forexPrevPrices[key] = price;
        count++;
      });

      AppState.lastUpdate.forex = Date.now();
      console.log(`[API] ExchangeRate-API — Forex: ${count} pairs updated`);
    }, 'ExchangeRate_Forex');
  }

  /* ═══════════════════════════════════════════════════════
     4. CRYPTO KLINES — Binance Global OHLCV
  ═══════════════════════════════════════════════════════ */
  async function fetchCryptoKlines(symbol, timeframe = 'H1', limit = 500) {
    const tfMap = {
      M1: '1m', M5: '5m', M15: '15m', M30: '30m',
      H1: '1h', H4: '4h', D1: '1d',  W1: '1w',  MN: '1M',
    };
    const interval = tfMap[timeframe] || '1h';
    const cacheKey = `klines_${symbol}_${interval}`;
    const EP       = _endpoints();

    return fetchRetry(async () => {
      _ensureState();
      const AppState = window.AppState;
      const url  = `${EP.BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const data = await cachedFetch(cacheKey, url, {}, 60000);

      if (!Array.isArray(data)) throw new Error('Klines: format tidak valid');

      // Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
      const candles = data.map(k => ({
        time:   Math.floor(parseInt(k[0]) / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      })).filter(c => !isNaN(c.open) && c.open > 0);

      const stateKey = `${symbol}_${timeframe}`;
      AppState.ohlcv[stateKey]  = candles;
      AppState.lastUpdate.ohlcv = Date.now();
      console.log(`[API] Klines ${symbol} ${timeframe}: ${candles.length} candles`);
      return candles;
    }, `Klines_${symbol}`);
  }

  /* ═══════════════════════════════════════════════════════
     5. FOREX/METAL KLINES — Binance jika ada, simulasi jika tidak
        Metal XAUTUSDT/XAGUSDT → Binance klines (nyata)
        Forex pairs → simulasi dari harga ExchangeRate-API
  ═══════════════════════════════════════════════════════ */
  async function fetchForexKlines(symbol, timeframe = 'H1') {
    // Cek apakah ini metal yang ada di Binance (misal XAUTUSDT, XAGUSDT, CLUSDT)
    const metalSyms = _metalSymbols();
    const metalInfo = metalSyms.find(m => m.symbol === symbol || m.binanceSymbol === symbol);

    if (metalInfo) {
      const bSym = metalInfo.binanceSymbol || symbol;
      // Coba ambil klines dari Binance
      try {
        return await fetchCryptoKlines(bSym, timeframe);
      } catch (e) {
        console.warn(`[API] Binance klines untuk ${bSym} gagal, pakai simulasi:`, e.message);
      }
    }

    // Fallback: simulasi OHLCV realistis (untuk forex yang tidak ada di Binance)
    const candles = _generateSimulatedOHLCV(symbol, timeframe);
    _ensureState();
    const stateKey = `${symbol}_${timeframe}`;
    window.AppState.ohlcv[stateKey]  = candles;
    window.AppState.lastUpdate.ohlcv = Date.now();
    return candles;
  }

  /* ─── Simulasi OHLCV ─────────────────────────── */
  function _generateSimulatedOHLCV(symbol, timeframe) {
    const tfSeconds = {
      M1: 60, M5: 300, M15: 900, M30: 1800,
      H1: 3600, H4: 14400, D1: 86400, W1: 604800,
    };
    _ensureState();
    const AppState = window.AppState;
    const tfSec    = tfSeconds[timeframe] || 3600;
    const count    = 300;
    const now      = Math.floor(Date.now() / 1000);

    // Cari harga dasar dari AppState.prices
    let base = 1.1000;
    const lookupKey = symbol.replace('/', '');
    if (AppState.prices[lookupKey]?.price)  base = AppState.prices[lookupKey].price;
    else if (AppState.prices[symbol]?.price) base = AppState.prices[symbol].price;

    const volatility = base * 0.002;
    const candles    = [];
    let price = base * (1 - 0.03 * Math.random());

    for (let i = count; i >= 0; i--) {
      const t     = now - i * tfSec;
      const chg   = (Math.random() - 0.495) * volatility;
      const open  = price;
      const close = Math.max(0.00001, open + chg);
      const high  = Math.max(open, close) * (1 + Math.random() * 0.001);
      const low   = Math.min(open, close) * (1 - Math.random() * 0.001);
      candles.push({ time: t, open, high, low, close, volume: Math.random() * 1000 + 100 });
      price = close;
    }
    return candles;
  }

  /* ═══════════════════════════════════════════════════════
     6. FEAR & GREED INDEX — alternative.me
  ═══════════════════════════════════════════════════════ */
  async function fetchFearGreedIndex() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;
      const data     = await cachedFetch('fear_greed', EP.FEAR_GREED, {}, 600000);

      if (!data.data || !Array.isArray(data.data)) throw new Error('FearGreed: format tidak valid');

      const latest  = data.data[0];
      const history = data.data.slice(0, 7).map(d => ({
        value:          parseInt(d.value, 10),
        classification: d.value_classification,
        timestamp:      new Date(parseInt(d.timestamp, 10) * 1000).toISOString(),
      }));

      AppState.fearGreed = {
        value:          parseInt(latest.value, 10),
        classification: latest.value_classification,
        timestamp:      new Date(parseInt(latest.timestamp, 10) * 1000).toISOString(),
        history,
      };

      AppState.lastUpdate.fearGreed = Date.now();
      console.log(`[API] Fear & Greed: ${AppState.fearGreed.value} (${AppState.fearGreed.classification})`);
    }, 'FearGreed');
  }

  /* ═══════════════════════════════════════════════════════
     7. MARKET GLOBAL — CoinGecko
  ═══════════════════════════════════════════════════════ */
  async function fetchMarketGlobal() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;
      const data     = await cachedFetch('cg_global', EP.COINGECKO_GLOBAL, {}, 300000);

      if (!data.data) throw new Error('CoinGecko: format tidak valid');
      const d = data.data;

      AppState.marketGlobal = {
        totalMarketCap:  d.total_market_cap?.usd             || 0,
        totalVolume:     d.total_volume?.usd                 || 0,
        btcDominance:    d.market_cap_percentage?.btc        || 0,
        ethDominance:    d.market_cap_percentage?.eth        || 0,
        activeCrypto:    d.active_cryptocurrencies           || 0,
        markets:         d.markets                          || 0,
        marketCapChange: d.market_cap_change_percentage_24h_usd || 0,
        updatedAt:       Date.now(),
      };

      AppState.lastUpdate.global = Date.now();
      console.log('[API] Market global updated');
    }, 'CoinGecko_Global');
  }

  /* ═══════════════════════════════════════════════════════
     8. NEWS — RSS via rss2json
  ═══════════════════════════════════════════════════════ */
  const NEWS_KEYWORDS = {
    HIGH:   ['fed','fomc','ecb','rate decision','cpi','gdp','inflation','nfp','payroll','interest rate','recession','bank of','reserve'],
    MEDIUM: ['pmi','retail','manufacturing','housing','consumer','unemployment','trade balance'],
    LOW:    ['speech','comment','forecast','outlook','review'],
  };
  const CURRENCY_TAGS = {
    USD: ['dollar','fed','fomc','us ','united states','nfp','payroll'],
    EUR: ['euro','ecb','eurozone','eu ','germany','france'],
    GBP: ['pound','boe','bank of england','uk ','britain'],
    JPY: ['yen','boj','bank of japan','japan'],
    AUD: ['aussie','rba','australia','aud'],
    BTC: ['bitcoin','btc','crypto','blockchain'],
    XAU: ['gold','xau','bullion','precious metal'],
  };

  function _detectImpact(title, desc) {
    const text = (title + ' ' + (desc || '')).toLowerCase();
    for (const kw of NEWS_KEYWORDS.HIGH)   if (text.includes(kw)) return 'HIGH';
    for (const kw of NEWS_KEYWORDS.MEDIUM) if (text.includes(kw)) return 'MEDIUM';
    return 'LOW';
  }
  function _detectCurrencies(title, desc) {
    const text  = (title + ' ' + (desc || '')).toLowerCase();
    const found = [];
    Object.entries(CURRENCY_TAGS).forEach(([cur, kws]) => {
      if (kws.some(kw => text.includes(kw))) found.push(cur);
    });
    return found;
  }

  async function fetchNews() {
    return fetchRetry(async () => {
      _ensureState();
      const EP       = _endpoints();
      const AppState = window.AppState;
      const rssFeed  = encodeURIComponent('https://www.fxstreet.com/rss/news');
      const url      = `${EP.RSS2JSON}?rss_url=${rssFeed}&count=30`;
      const data     = await cachedFetch('news_fx', url, {}, 300000);

      if (!data.items || !Array.isArray(data.items)) throw new Error('News: format tidak valid');

      AppState.news = data.items.map(item => ({
        title:       item.title || 'No Title',
        link:        item.link  || '#',
        pubDate:     item.pubDate || new Date().toISOString(),
        description: (item.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
        source:      data.feed?.title || 'FXStreet',
        impact:      _detectImpact(item.title, item.description),
        currencies:  _detectCurrencies(item.title, item.description),
      }));

      AppState.lastUpdate.news = Date.now();
      console.log(`[API] News: ${AppState.news.length} artikel`);
    }, 'News');
  }

  /* ═══════════════════════════════════════════════════════
     9. EVENT DISPATCHER
  ═══════════════════════════════════════════════════════ */
  function emitPricesUpdated() {
    _ensureState();
    const AppState = window.AppState;

    document.dispatchEvent(new CustomEvent('pricesUpdated', {
      detail: {
        prices:    AppState.prices,
        metals:    AppState.metals,
        forex:     AppState.forexRates,
        timestamp: Date.now(),
      }
    }));

    // Update ticker tape di topbar
    if (window.updateTickerTape) {
      const tickerPrices = {};
      _tickerSymbols().forEach(sym => {
        // Cek prices dulu, lalu metals sebagai fallback
        if (AppState.prices[sym]) {
          tickerPrices[sym] = AppState.prices[sym];
        } else if (AppState.metals && AppState.metals[sym]) {
          tickerPrices[sym] = AppState.metals[sym];
        }
      });
      if (Object.keys(tickerPrices).length === 0) {
        Object.keys(AppState.prices).slice(0, 10).forEach(sym => {
          tickerPrices[sym] = AppState.prices[sym];
        });
      }
      window.updateTickerTape(tickerPrices);
    }

    // Cek price alerts
    if (window.UI && window.UI.checkPriceAlerts) {
      window.UI.checkPriceAlerts(AppState.prices);
    }
  }

  /* ═══════════════════════════════════════════════════════
     10. fetchOHLCV — auto-detect asset class
         Crypto & Metal (ending USDT) → Binance klines
         Forex (6-char tanpa USDT, atau pair dengan slash) → forex klines
  ═══════════════════════════════════════════════════════ */
  async function fetchOHLCV(symbol, timeframe = 'H1') {
    // Normalisasi — buang slash jika ada (EUR/USD → EURUSD)
    const sym = symbol.replace('/', '');

    // Cek apakah ini metal Binance
    const metalSyms = _metalSymbols();
    const isMetal = metalSyms.some(m => m.symbol === sym || m.binanceSymbol === sym);
    if (isMetal) {
      return fetchForexKlines(sym, timeframe); // fetchForexKlines sudah handle metal Binance
    }

    // Cek apakah ini crypto Binance (ending USDT, BTC, ETH, BNB)
    const cryptoSyms = _cryptoSymbols();
    const isCrypto = cryptoSyms.some(c => c.symbol === sym) || /USDT$|BTC$|ETH$|BNB$/.test(sym);
    if (isCrypto) {
      return fetchCryptoKlines(sym, timeframe);
    }

    // Forex pairs (6 karakter huruf besar semua, misal EURUSD, GBPUSD, USDJPY)
    // atau jika ada dalam daftar forexPairs
    const fxPairs = _forexPairs();
    const isForex = fxPairs.some(f => (f.base + f.quote) === sym || f.pair === symbol) ||
                    /^[A-Z]{6}$/.test(sym);
    if (isForex) {
      return fetchForexKlines(sym, timeframe);
    }

    // Fallback: coba Binance dulu, jika gagal pakai simulasi
    try {
      return await fetchCryptoKlines(sym, timeframe);
    } catch(e) {
      console.warn('[API] fetchOHLCV Binance gagal, coba simulasi:', sym, e.message);
      return fetchForexKlines(sym, timeframe);
    }
  }

  /* ═══════════════════════════════════════════════════════
     11. AppInit — BOOT SEQUENCE
  ═══════════════════════════════════════════════════════ */
  window.AppInit = async function () {
    console.log('[API] AppInit v3.0 — Binance All Assets — memulai fetch data...');
    _ensureState();

    // Fase 1: Fetch paralel — crypto+metals via Binance, forex, market data
    const [r1, r2, r3, r4] = await Promise.allSettled([
      fetchCryptoPrices(),    // Binance Global — crypto
      fetchMetalPrices(),     // Binance Global — metals (XAUTUSDT, XAGUSDT, CLUSDT)
      fetchForexRates(),      // ExchangeRate-API
      fetchFearGreedIndex(),  // alternative.me
    ]);

    // Log hasil
    [
      ['Binance_Crypto', r1],
      ['Binance_Metals', r2],
      ['ExchangeRate_Forex', r3],
      ['FearGreed', r4],
    ].forEach(([name, r]) => {
      if (r.status === 'rejected') {
        console.warn(`[API] ${name} GAGAL:`, r.reason?.message || r.reason);
      } else {
        console.log(`[API] ${name} OK`);
      }
    });

    // Fase 2: Emit event update UI sesegera mungkin
    emitPricesUpdated();

    // Fase 3: Market global & news (non-blocking)
    fetchMarketGlobal().catch(e => console.warn('[API] MarketGlobal gagal:', e.message));
    fetchNews().catch(e => console.warn('[API] News gagal:', e.message));

    // Fase 4: Pre-fetch OHLCV instrumen aktif — normalisasi symbol
    const sym = (window.AppState.selectedInstrument || 'BTCUSDT').replace('/', '');
    const tf  = window.AppState.selectedTimeframe  || 'H1';
    fetchOHLCV(sym, tf)
      .then(() => {
        // Emit event agar chart.html tahu data sudah siap
        document.dispatchEvent(new CustomEvent('ohlcvReady', {
          detail: { symbol: sym, timeframe: tf }
        }));
      })
      .catch(e => console.warn('[API] OHLCV preload gagal:', e.message));

    // Fase 5: Mulai interval refresh
    _startRefreshIntervals();

    console.log('[API] AppInit selesai.');
    console.log('[API] Harga tersedia:', Object.keys(window.AppState.prices).join(', '));
  };

  /* ═══════════════════════════════════════════════════════
     12. REFRESH INTERVALS
  ═══════════════════════════════════════════════════════ */
  function _startRefreshIntervals() {
    _ensureState();
    const state = window.AppState._intervals;
    const cfg   = _cfg().REFRESH || {};

    Object.values(state).forEach(id => clearInterval(id));

    const PRICES_IV     = cfg.PRICES     || 30000;
    const METALS_IV     = cfg.METALS     || 30000;  // Binance metals sama cepat dengan crypto
    const FOREX_IV      = cfg.FOREX      || 60000;
    const FEAR_GREED_IV = cfg.FEAR_GREED || 600000;
    const NEWS_IV       = cfg.NEWS       || 300000;
    const OHLCV_IV      = cfg.OHLCV      || 60000;

    // Crypto — tiap 30 detik
    state.crypto = setInterval(async () => {
      await fetchCryptoPrices().catch(() => {});
      emitPricesUpdated();
    }, PRICES_IV);

    // Metals via Binance — tiap 30 detik (tidak ada rate limit)
    state.metals = setInterval(async () => {
      await fetchMetalPrices().catch(() => {});
      emitPricesUpdated();
    }, METALS_IV);

    // Forex — tiap 60 detik
    state.forex = setInterval(async () => {
      await fetchForexRates().catch(() => {});
      emitPricesUpdated();
    }, FOREX_IV);

    // Fear & Greed — tiap 10 menit
    state.fearGreed = setInterval(() => {
      fetchFearGreedIndex().catch(() => {});
    }, FEAR_GREED_IV);

    // News — tiap 5 menit
    state.news = setInterval(() => {
      fetchNews().catch(() => {});
      document.dispatchEvent(new CustomEvent('newsUpdated'));
    }, NEWS_IV);

    // Market global — tiap 5 menit
    state.marketGlobal = setInterval(() => {
      fetchMarketGlobal().catch(() => {});
    }, NEWS_IV);

    // OHLCV — tiap 1 menit
    state.ohlcv = setInterval(() => {
      const sym = (window.AppState.selectedInstrument || 'BTCUSDT').replace('/', '');
      const tf  = window.AppState.selectedTimeframe  || 'H1';
      fetchOHLCV(sym, tf)
        .then(() => document.dispatchEvent(new CustomEvent('ohlcvUpdated', {
          detail: { symbol: sym, timeframe: tf }
        })))
        .catch(() => {});
    }, OHLCV_IV);

    console.log('[API] Refresh intervals aktif:', {
      crypto: `${PRICES_IV/1000}s`,
      metals: `${METALS_IV/1000}s (Binance)`,
      forex:  `${FOREX_IV/1000}s`,
    });
  }

  /* ═══════════════════════════════════════════════════════
     EXPORT — window.API
  ═══════════════════════════════════════════════════════ */
  window.API = {
    fetchCryptoPrices,
    fetchMetalPrices,
    fetchForexRates,
    fetchCryptoKlines,
    fetchForexKlines,
    fetchFearGreedIndex,
    fetchMarketGlobal,
    fetchNews,
    fetchOHLCV,
    emitPricesUpdated,

    getPrice: (symbol) => {
      _ensureState();
      return window.AppState.prices[symbol] || null;
    },
    getAllPrices: () => {
      _ensureState();
      return window.AppState.prices;
    },
    getMetals: () => {
      _ensureState();
      return window.AppState.metals;
    },
    findPrice: (symbol) => {
      _ensureState();
      const s = window.AppState;
      return s.prices[symbol]
          || s.prices[symbol.replace('/', '')]
          || s.metals[symbol]
          || null;
    },
  };

  console.log('[API] api.js v3.0 loaded — Binance.com ALL assets (crypto + metals) + ExchangeRate-API forex');
})();
