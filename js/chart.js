/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — chart.js  (v4.0 — TradingView Edition)
   
   Chart grafik candle sekarang menggunakan TradingView Widget
   yang di-load langsung dari s3.tradingview.com/tv.js
   
   File ini hanya menyediakan ChartManager stub untuk kompatibilitas
   dengan kode lain yang mungkin merujuk ke window.ChartManager.
   
   Semua logika chart (load, switch TF, dsb) sudah dipindah ke
   dalam chart.html sebagai controller mandiri.
   
   Bergantung pada: config.js, api.js, indicators.js
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── ChartManager stub ─── 
     Disediakan agar kode lain yang memanggil window.ChartManager
     tidak error. Logika sebenarnya ada di chart.html controller.
  */
  window.ChartManager = window.ChartManager || {

    /* Stub — chart sekarang di-handle oleh TradingView Widget */
    initChart: function(containerId) {
      console.log('[ChartManager] v4.0 — TradingView mode, initChart diabaikan:', containerId);
      return true; /* Return true agar tidak trigger error di kode lama */
    },

    loadInstrumentData: function(symbol, tf) {
      console.log('[ChartManager] v4.0 — loadInstrumentData diabaikan (TV mode):', symbol, tf);
      return Promise.resolve([]);
    },

    switchTimeframe: function(tf) {
      console.log('[ChartManager] v4.0 — switchTimeframe diabaikan (TV mode):', tf);
      return Promise.resolve();
    },

    handleResize: function() {
      /* Tidak perlu — TradingView widget autosize=true */
    },

    toggleOverlay:     function() { return false; },
    togglePane:        function() { return false; },
    addIndicatorOverlay: function() {},
    addIndicatorPane:    function() {},
    drawFibonacci:       function() {},
    autoDrawFibonacci:   function() {},
    drawOrderBlock:      function() {},
    autoDrawOrderBlocks: function() {},
    drawFVG:             function() {},

    getCurrentData:   function() { return []; },
    getCurrentSymbol: function() {
      return (window.AppState && window.AppState.selectedInstrument) || 'BTCUSDT';
    },
    getCurrentTF: function() {
      return (window.AppState && window.AppState.selectedTimeframe) || 'H1';
    },
    getChart: function() { return null; },
  };

  window.getDecimals = window.getDecimals || function(sym) {
    if (sym.includes('JPY')) return 3;
    if (sym.endsWith('USDT')) return 2;
    return 5;
  };

  console.log('[ChartManager] chart.js v4.0 loaded — TradingView Widget mode');
})();
