export const riskAlerts = [
  {
    id: "loss-cap",
    title: "17 clients hit daily loss cap",
    detail:
      "Demo auto-halt applied. Existing positions have trailing stop-loss enabled.",
    meta: "10:28 IST",
    tone: "red",
  },
  {
    id: "session",
    title: "3 broker sessions expiring",
    detail:
      "Motilal token refresh required before the afternoon index rebalance.",
    meta: "45 min",
    tone: "orange",
  },
  {
    id: "drawdown",
    title: "Vwap reversion ceiling alert",
    detail:
      "Drawdown is near the shutdown threshold. New entries are suppressed.",
    meta: "4.8% / 5.0%",
    tone: "orange",
  },
];
