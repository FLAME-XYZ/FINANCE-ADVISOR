/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — config.js  (v3.0 — Binance All)
   Sumber data:
     • Crypto  → Binance Global  (api.binance.com)  — CORS OK
     • Metals  → Binance Global  (XAUTUSDT, XAGUSDT, CLUSDT) — REAL prices
     • Forex   → ExchangeRate-API (open.er-api.com) — gratis, no key
   TIDAK ada fungsi fetch di file ini
   ═══════════════════════════════════════════════════════════════ */

window.CONFIG = {

  // ═══════════════════════════════════════════
  // API ENDPOINTS
  // ═══════════════════════════════════════════
  API: {
    // ── BINANCE GLOBAL — Crypto OHLCV & Ticker (CORS OK, no key) ──
    BINANCE_BASE:    'https://api.binance.com/api/v3',
    BINANCE_TICKER:  'https://api.binance.com/api/v3/ticker/24hr',
    BINANCE_PRICE:   'https://api.binance.com/api/v3/ticker/price',
    BINANCE_KLINES:  'https://api.binance.com/api/v3/klines',
    BINANCE_BOOK:    'https://api.binance.com/api/v3/depth',
    BINANCE_TRADES:  'https://api.binance.com/api/v3/trades',

    // ── EXCHANGERATE-API — Forex rates (CORS OK, no key, update ~1 jam) ──
    FOREX_BASE:      'https://open.er-api.com/v6/latest/USD',
    OER_LATEST:      'https://open.er-api.com/v6/latest/USD',

    // ── FEAR & GREED INDEX — Crypto sentiment (no key) ──
    FEAR_GREED:      'https://api.alternative.me/fng/?limit=7',

    // ── COINGECKO — Crypto market data (no key, rate limited) ──
    COINGECKO_BASE:  'https://api.coingecko.com/api/v3',
    COINGECKO_GLOBAL:'https://api.coingecko.com/api/v3/global',

    // ── RSS2JSON — News feed converter ──
    RSS2JSON_BASE:   'https://api.rss2json.com/v1/api.json',
  },

  // ═══════════════════════════════════════════
  // INSTRUMEN — CRYPTO (dari Binance Global)
  // ═══════════════════════════════════════════
  CRYPTO_SYMBOLS: [
    { symbol: 'BTCUSDT',  display: 'BTC/USDT',  name: 'Bitcoin',   coingecko: 'bitcoin',      decimals: 2 },
    { symbol: 'ETHUSDT',  display: 'ETH/USDT',  name: 'Ethereum',  coingecko: 'ethereum',     decimals: 2 },
    { symbol: 'BNBUSDT',  display: 'BNB/USDT',  name: 'BNB',       coingecko: 'binancecoin',  decimals: 2 },
    { symbol: 'SOLUSDT',  display: 'SOL/USDT',  name: 'Solana',    coingecko: 'solana',       decimals: 2 },
    { symbol: 'XRPUSDT',  display: 'XRP/USDT',  name: 'XRP',       coingecko: 'ripple',       decimals: 4 },
    { symbol: 'ADAUSDT',  display: 'ADA/USDT',  name: 'Cardano',   coingecko: 'cardano',      decimals: 4 },
    { symbol: 'DOGEUSDT', display: 'DOGE/USDT', name: 'Dogecoin',  coingecko: 'dogecoin',     decimals: 5 },
    { symbol: 'AVAXUSDT', display: 'AVAX/USDT', name: 'Avalanche', coingecko: 'avalanche-2',  decimals: 3 },
    { symbol: 'LINKUSDT', display: 'LINK/USDT', name: 'Chainlink', coingecko: 'chainlink',    decimals: 3 },
    { symbol: 'DOTUSDT',  display: 'DOT/USDT',  name: 'Polkadot',  coingecko: 'polkadot',     decimals: 3 },
    { symbol: 'MATICUSDT',display: 'MATIC/USDT',name: 'Polygon',   coingecko: 'matic-network',decimals: 4 },
    { symbol: 'LTCUSDT',  display: 'LTC/USDT',  name: 'Litecoin',  coingecko: 'litecoin',     decimals: 2 },
  ],

  // ═══════════════════════════════════════════
  // INSTRUMEN — FOREX
  // ═══════════════════════════════════════════
  FOREX_PAIRS: [
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
  ],

  // ═══════════════════════════════════════════
  // INSTRUMEN — METALS & COMMODITIES
  // Semua via Binance:
  //   XAUTUSDT = Paxos Gold (1 XAUT = 1 troy oz XAU) — harga NYATA
  //   XAGUSDT  = Silver token — harga NYATA
  //   CL/USDT  = Crude Oil via commodities proxy
  // symbol  = Binance ticker symbol
  // display = label tampilan di UI
  // ═══════════════════════════════════════════
  METAL_SYMBOLS: [
    { symbol: 'XAUTUSDT', display: 'XAU/USDT', name: 'Gold',      decimals: 2, unit: 'troy oz', assetClass: 'metals',      binanceSymbol: 'XAUTUSDT' },
    { symbol: 'CLUSDT',   display: 'CL/USDT',  name: 'Crude Oil', decimals: 2, unit: 'barrel',  assetClass: 'commodities', binanceSymbol: 'CLUSDT'   },
    { symbol: 'XAGUSDT',  display: 'XAG/USDT', name: 'Silver',    decimals: 3, unit: 'troy oz', assetClass: 'metals',      binanceSymbol: 'XAGUSDT'  },
  ],

  // ═══════════════════════════════════════════
  // TICKER TAPE — instrumen di topbar
  // ═══════════════════════════════════════════
  TICKER_SYMBOLS: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
    'XAUTUSDT', 'XAGUSDT',
    'EURUSD', 'GBPUSD', 'USDJPY',
  ],

  // ═══════════════════════════════════════════
  // TIMEFRAMES
  // ═══════════════════════════════════════════
  TIMEFRAMES: {
    M1:  { binance: '1m',  label: '1m',  seconds: 60      },
    M5:  { binance: '5m',  label: '5m',  seconds: 300     },
    M15: { binance: '15m', label: '15m', seconds: 900     },
    M30: { binance: '30m', label: '30m', seconds: 1800    },
    H1:  { binance: '1h',  label: '1H',  seconds: 3600    },
    H4:  { binance: '4h',  label: '4H',  seconds: 14400   },
    D1:  { binance: '1d',  label: '1D',  seconds: 86400   },
    W1:  { binance: '1w',  label: '1W',  seconds: 604800  },
    MN:  { binance: '1M',  label: '1M',  seconds: 2592000 },
  },

  CANDLE_COUNT: {
    M1: 200, M5: 200, M15: 200, M30: 200,
    H1: 300, H4: 300, D1: 365,  W1: 104, MN: 60,
  },

  // ═══════════════════════════════════════════
  // REFRESH INTERVALS (milliseconds)
  // ═══════════════════════════════════════════
  REFRESH: {
    PRICES:     30000,   // 30 detik — crypto prices
    METALS:     30000,   // 30 detik — metals via Binance (no rate limit)
    OHLCV:      60000,   // 60 detik — candle data
    NEWS:       300000,  // 5 menit  — berita
    FOREX:      60000,   // 60 detik — forex
    FEAR_GREED: 600000,  // 10 menit — fear & greed
    SESSION:    60000,   // 1 menit  — market session
  },

  // ═══════════════════════════════════════════
  // ICT KILLZONES (jam UTC)
  // ═══════════════════════════════════════════
  KILLZONES: {
    asian:   { start: 0,  end: 4,  color: 'rgba(255,200,0,0.06)',  label: 'Asian KZ',  short: 'AS' },
    london:  { start: 7,  end: 10, color: 'rgba(0,150,255,0.06)',  label: 'London KZ', short: 'LN' },
    newyork: { start: 13, end: 16, color: 'rgba(0,220,100,0.06)',  label: 'NY KZ',     short: 'NY' },
    lcclose: { start: 15, end: 17, color: 'rgba(255,100,100,0.06)',label: 'LC Close',  short: 'LC' },
  },

  // ═══════════════════════════════════════════
  // MARKET SESSIONS (jam UTC)
  // ═══════════════════════════════════════════
  SESSIONS: {
    sydney:  { start: 21, end: 6,  label: 'Sydney',   color: '#ffd700' },
    tokyo:   { start: 0,  end: 9,  label: 'Tokyo',    color: '#ff6b9d' },
    london:  { start: 7,  end: 16, label: 'London',   color: '#4dabf7' },
    newyork: { start: 13, end: 22, label: 'New York', color: '#00d084' },
  },

  // ═══════════════════════════════════════════
  // INDIKATOR — DEFAULT SETTINGS
  // ═══════════════════════════════════════════
  INDICATOR_DEFAULTS: {
    RSI:      { period: 14, overbought: 70, oversold: 30 },
    MACD:     { fast: 12, slow: 26, signal: 9 },
    BB:       { period: 20, stdDev: 2 },
    EMA:      { periods: [9, 21, 50, 200] },
    SMA:      { periods: [20, 50, 200] },
    ATR:      { period: 14 },
    STOCH:    { k: 14, d: 3, smooth: 3, overbought: 80, oversold: 20 },
    ADX:      { period: 14, strong: 25 },
    CCI:      { period: 20, overbought: 100, oversold: -100 },
    OBV:      { period: 20 },
    VWAP:     { enabled: true },
    ICHIMOKU: { tenkan: 9, kijun: 26, senkou: 52 },
  },

  FIB_LEVELS: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618, 2.0, 2.618],
  FIB_COLORS: {
    0: '#e6edf3', 0.236: '#ffd700', 0.382: '#00d084', 0.5: '#4dabf7',
    0.618: '#ff9f43', 0.786: '#b892ff', 1.0: '#e6edf3',
    1.272: '#ff4757', 1.618: '#ff4757', 2.0: '#ff4757', 2.618: '#ff4757',
  },

  HARMONIC_PATTERNS: {
    Gartley:  { XAB: 0.618, ABC: [0.382,0.886], BCD: [1.13,1.618], XAD: [0.786] },
    Bat:      { XAB: [0.382,0.5], ABC: [0.382,0.886], BCD: [1.618,2.618], XAD: [0.886] },
    Butterfly:{ XAB: 0.786, ABC: [0.382,0.886], BCD: [1.618,2.24], XAD: [1.27,1.618] },
    Crab:     { XAB: [0.382,0.618], ABC: [0.382,0.886], BCD: [2.24,3.618], XAD: [1.618] },
    Shark:    { XAB: [0.5], ABC: [1.13,1.618], BCD: [1.618,2.24], XAD: [0.886,1.13] },
    Cypher:   { XAB: [0.382,0.618], ABC: [1.13,1.414], BCD: [0.786], XAD: [0.786] },
  },

  CALCULATOR: {
    DEFAULT_BALANCE:  10000,
    DEFAULT_RISK_PCT: 1,
    DEFAULT_LEVERAGE: 10,
    LOT_SIZE_FOREX:   100000,
    LOT_SIZE_CRYPTO:  1,
    CURRENCY:         'USD',
  },

  CHART: {
    CANDLE_UP:          '#00d084',
    CANDLE_DOWN:        '#ff4757',
    CANDLE_UP_BORDER:   '#00d084',
    CANDLE_DOWN_BORDER: '#ff4757',
    WICK_UP:            '#00d084',
    WICK_DOWN:          '#ff4757',
    GRID_COLOR:         'rgba(48,54,61,0.5)',
    CROSSHAIR_COLOR:    'rgba(77,171,247,0.6)',
    BG_COLOR:           '#0d1117',
    TEXT_COLOR:         '#7d8590',
  },

  SMC: {
    OB_LOOKBACK:        20,
    FVG_MIN_SIZE:       0.001,
    LIQUIDITY_LOOKBACK: 50,
    CHoCH_SENSITIVITY:  3,
    BOS_SENSITIVITY:    2,
  },

  SIGNAL: {
    MIN_CONFLUENCE: 65,
    STRONG_SIGNAL:  80,
    WEIGHTS: {
      trend: 25, momentum: 20, structure: 20,
      pattern: 15, volume: 10, timeframe: 10,
    },
  },

  APP: {
    NAME:     'ProTrader Analytics',
    VERSION:  '3.0.0',
    TIMEZONE: 'Asia/Jakarta',
    LOCALE:   'id-ID',
    CURRENCY: 'USD',
  },
};

// ═══════════════════════════════════════════════
// GLOBAL APP STATE
// ═══════════════════════════════════════════════
window.AppState = {
  currentPage:        'dashboard',
  selectedInstrument: 'BTCUSDT',
  selectedTimeframe:  'H1',
  selectedAssetClass: 'crypto',

  darkMode: localStorage.getItem('darkMode') !== 'false',

  watchlist: (function() {
    try {
      return JSON.parse(localStorage.getItem('watchlist'))
        || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'XAUTUSDT', 'EURUSD'];
    } catch { return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'XAUTUSDT', 'EURUSD']; }
  })(),

  priceAlerts: (function() {
    try { return JSON.parse(localStorage.getItem('priceAlerts')) || []; }
    catch { return []; }
  })(),

  // Live Prices — semua instrumen tersimpan di sini
  prices: {},

  ohlcv:       {},
  metals:      {},
  forexRates:  {},
  fearGreed:   null,
  news:        [],
  marketGlobal:null,
  activeSignals:[],

  lastUpdate: {
    prices: null, ohlcv: null, metals: null,
    forex: null, fearGreed: null, news: null, global: null,
  },

  _intervals: {},
  _charts:    {},
  isOnline:   navigator.onLine,
  apiErrors:  {},
};

// ═══════════════════════════════════════════════
// HELPERS — Watchlist & Alerts
// ═══════════════════════════════════════════════
window.AppState.saveWatchlist = function() {
  try { localStorage.setItem('watchlist', JSON.stringify(this.watchlist)); }
  catch(e) { console.warn('[Config] Gagal simpan watchlist:', e); }
};

window.AppState.savePriceAlerts = function() {
  try { localStorage.setItem('priceAlerts', JSON.stringify(this.priceAlerts)); }
  catch(e) { console.warn('[Config] Gagal simpan priceAlerts:', e); }
};

window.AppState.addToWatchlist = function(symbol) {
  if (!this.watchlist.includes(symbol)) {
    this.watchlist.push(symbol);
    this.saveWatchlist();
    return true;
  }
  return false;
};

window.AppState.removeFromWatchlist = function(symbol) {
  const idx = this.watchlist.indexOf(symbol);
  if (idx > -1) { this.watchlist.splice(idx, 1); this.saveWatchlist(); return true; }
  return false;
};

window.AppState.addPriceAlert = function(symbol, price, direction) {
  const alert = {
    id: `alert_${Date.now()}`, symbol,
    price: parseFloat(price), direction,
    triggered: false, createdAt: new Date().toISOString(),
  };
  this.priceAlerts.push(alert);
  this.savePriceAlerts();
  return alert;
};

window.AppState.removePriceAlert = function(id) {
  this.priceAlerts = this.priceAlerts.filter(a => a.id !== id);
  this.savePriceAlerts();
};

window.addEventListener('online',  () => { window.AppState.isOnline = true; });
window.addEventListener('offline', () => { window.AppState.isOnline = false; });

// ═══════════════════════════════════════════════
// LOOKUP HELPERS
// ═══════════════════════════════════════════════
window.getCryptoInfo = function(symbol) {
  return CONFIG.CRYPTO_SYMBOLS.find(c => c.symbol === symbol) || null;
};

window.getForexInfo = function(pair) {
  return CONFIG.FOREX_PAIRS.find(f => f.pair === pair) || null;
};

// Cari metal by symbol (XAUTUSDT) atau binanceSymbol atau name
window.getMetalInfo = function(symbol) {
  return CONFIG.METAL_SYMBOLS.find(m =>
    m.symbol === symbol ||
    m.binanceSymbol === symbol ||
    (m.name && m.name.toLowerCase() === symbol.toLowerCase())
  ) || null;
};

window.getDecimals = function(symbol) {
  const c = getCryptoInfo(symbol);    if (c) return c.decimals;
  const m = getMetalInfo(symbol);     if (m) return m.decimals;
  const f = getForexInfo(symbol);     if (f) return f.pip < 0.001 ? 3 : 5;
  return 2;
};

console.log(`[Config] ProTrader Analytics v${CONFIG.APP.VERSION} loaded — Binance.com ALL assets`);
