import type { GlossaryEntry } from "./glossary";

/** The glossary of the English site, by entry id. An entry missing here shows in French. */
export const GLOSSARY_EN: Record<string, Pick<GlossaryEntry, "term" | "short" | "long" | "example">> = {
  // The basics
  backtest: {
    term: "Backtest",
    short: "Replaying a strategy on past prices to see what it would have made or lost.",
    long: "Backtest Lab applies your rules candle by candle over the history, as if you had traded back then, fees included. It's a test on the past: it guarantees nothing for the future, but it quickly weeds out the ideas that don't work.",
  },
  symbole: {
    term: "Symbol (pair)",
    short: "What you trade: a crypto (BTCUSDT = bitcoin in dollars), a currency pair (EURUSD), gold (XAUUSD) or the Nasdaq 100 (NAS100).",
    example: "ETHUSDT = ether in dollars, GBPUSD = the pound in dollars.",
  },
  forex: {
    term: "Forex, gold and Nasdaq",
    short: "On top of crypto: the major currency pairs (EURUSD…), gold (XAUUSD) and the Nasdaq 100: NAS100 (the future, around 28,000, nearly 24 hours a day on weekdays) or QQQ (the fund that tracks it, traded during New York market hours). These markets are closed at the weekend.",
    long: "They're mostly traded as CFDs with a broker: no platform fee but a spread, and a small funding cost if the position stays open overnight. Pick the “Forex, gold, Nasdaq” fee profile. Live tracking of these markets refreshes every 5 minutes.",
    example: "EURUSD at 1.08 = 1 euro is worth 1.08 dollars. XAUUSD at 2,400 = an ounce of gold is worth 2,400 dollars.",
  },
  pip: {
    term: "Pip",
    short: "The smallest usual price step in forex: 0.0001 on EURUSD, 0.01 on USDJPY. Backtest Lab works in %, ATR or R, not in pips.",
  },
  bougie: {
    term: "Candle",
    short: "The price summed up over a period: open, high, low and close.",
    long: "A green candle closed higher than it opened, a red one lower. The “wicks” show how far the price went during the period.",
  },
  "unite-de-temps": {
    term: "Timeframe",
    short: "How long one candle lasts: 1m = 1 minute, 1h = 1 hour, 1d = 1 day.",
    long: "The shorter the timeframe, the more trades and the more fees weigh. To start with, 4h or 1d give steadier results.",
  },
  long: {
    term: "Buy (long)",
    short: "You buy betting that the price will rise. You win if you sell higher.",
  },
  short: {
    term: "Short sell (short)",
    short: "You sell without owning the asset, betting that the price will fall. You win if you buy it back cheaper.",
    long: "It needs a futures or margin account. To start with, stick to buying only.",
  },
  style: {
    term: "Scalping, day trading, swing",
    short: "How long your trades last: a few minutes (scalping), within the day (day trading), several days (swing).",
  },
  fuseau: {
    term: "Time zone",
    short: "Used by time rules (“no entry before 9am”) and the day's levels. Pick the zone you trade in, e.g. America/New_York or Europe/London.",
  },

  // Rules and indicators
  signal: {
    term: "Signal and conditions",
    short: "A rule such as “RSI 14 < 30”. When all the conditions of a group are true, the strategy enters a position.",
    long: "Rules are checked at the close of each candle, and the order goes out at the open of the next one: never any peeking into the future.",
  },
  "et-ou": {
    term: "AND / OR",
    short: "AND: all the conditions must be true at the same time. OR: a single group of conditions is enough.",
    example: "“RSI < 30 AND close > SMA 200” is more selective than “RSI < 30” alone.",
  },
  croise: {
    term: "Crosses above / below",
    short: "True only on the candle where one line moves to the other side of the other, not on the candles after.",
    example: "“EMA 20 crosses above EMA 50” fires only once, at the moment of the crossover.",
  },
  periode: {
    term: "Period",
    short: "The number of candles used to compute an indicator. RSI 14 = computed over the last 14 candles.",
  },
  mm: {
    term: "Simple moving average (SMA)",
    short: "The average price of the last N candles. It smooths the price and shows the trend.",
    example: "Close above the SMA 200 = trend rather up.",
  },
  mme: {
    term: "Exponential moving average (EMA)",
    short: "Like the SMA, but it gives more weight to recent candles: it reacts faster.",
  },
  rsi: {
    term: "RSI",
    short: "Measures from 0 to 100 the strength of recent rises against falls. Below 30: the price has fallen a lot; above 70: it has risen a lot.",
  },
  atr: {
    term: "ATR",
    short: "The average size of a candle (in price) over N candles. It measures how restless the market is.",
    long: "A stop “at 2 ATR” adapts by itself: wider when the market moves a lot, tighter when it's calm. ATR in % is the same thing relative to the price.",
  },
  bollinger: {
    term: "Bollinger Bands",
    short: "A moving average with two bands around it. The price stays between the bands most of the time; it leaves them during big moves.",
  },
  macd: {
    term: "MACD",
    short: "The difference between a fast EMA and a slow EMA. Positive in an uptrend, negative in a downtrend.",
    long: "The signal line is an average of the MACD; the histogram is the gap between the two. The MACD / signal crossover is a classic signal.",
  },
  stochastique: {
    term: "Stochastic",
    short: "Places the close between the low and the high of the last N candles, from 0 to 100. Close to 0: near the low.",
  },
  adx: {
    term: "ADX",
    short: "Measures the strength of a trend, not its direction. Above 25: the market is in a real trend.",
  },
  roc: {
    term: "Rate of change (ROC)",
    short: "How much the price has changed, in %, over N candles.",
  },
  ibs: {
    term: "IBS",
    short: "Where the candle closed between its low (0) and its high (1). Below 0.2: a close right near the low.",
  },
  vwap: {
    term: "VWAP",
    short: "The day's average price, weighted by the volume traded. Many day traders use it as a reference.",
  },
  volume: {
    term: "Volume",
    short: "The quantity traded during the candle. A move with a lot of volume is often more reliable.",
  },
  niveaux: {
    term: "Highest / lowest over N candles",
    short: "The highest (or lowest) price reached over the last N candles. Used to spot breakouts.",
  },
  veille: {
    term: "Previous day levels",
    short: "The high, the low and the close of the previous day, often used as support and resistance.",
  },
  semaine: {
    term: "Last week's levels",
    short: "The high and the low of the previous week (Monday to Sunday). Levels swing traders watch.",
  },
  "plage-horaire": {
    term: "High and low of a time range",
    short: "The high and the low reached between two times you choose, for example the first 15 minutes of the New York session, or the night.",
    long: "The level only exists once the range is over: before that, the rule doesn't fire. It stays valid until the end of the day. Candles must be shorter than the range, otherwise it covers the whole candle.",
    example: "Opening range: America/New_York time zone, 09:30 to 09:45, then “close crosses above the range high”.",
  },
  pivots: {
    term: "Pivot points",
    short: "Levels computed each day from the previous day's high, low and close: the central pivot, then R1, R2 above and S1, S2 below.",
    long: "Above the pivot, the day leans up; below it, it leans down. R1 and S1 are often reached, R2 and S2 on busy days.",
  },
  camarilla: {
    term: "Camarilla pivots",
    short: "A variant of the pivots, tighter around the previous close. Traders often play the return to the centre at R3 and S3, and the breakout beyond R4 and S4.",
  },
  supertrend: {
    term: "Supertrend",
    short: "A line a few ATR from the price: below the price in an uptrend, above it in a downtrend. It switches sides when the trend turns.",
    example: "“Close > Supertrend(10, 3)” = uptrend.",
  },
  psar: {
    term: "Parabolic SAR",
    short: "Dots that follow the price and close in on it faster and faster during a trend. Often used as a trailing stop.",
  },
  ichimoku: {
    term: "Ichimoku",
    short: "A complete Japanese system: two balance lines (Tenkan, fast, and Kijun, slow) and a cloud made of two edges. Above the cloud, the trend is up.",
    long: "Inside the cloud, the market hesitates. The Tenkan / Kijun crossover above the cloud is a classic signal. The 9, 26, 52 settings are the author's and remain the most followed.",
  },
  keltner: {
    term: "Keltner Channels",
    short: "An EMA with two bands a few ATR away. Smoother than Bollinger Bands.",
  },
  "bollinger-b": {
    term: "Bollinger %B and width",
    short: "%B places the close between the Bollinger Bands: 0 on the lower band, 1 on the upper band. The width measures the gap between the bands, in % of the price.",
  },
  squeeze: {
    term: "Squeeze",
    short: "Equals 1 when the Bollinger Bands move inside the Keltner Channels: the market is unusually calm, and a big move often follows.",
    long: "The squeeze doesn't say which way the price will go. Wait for it to release (1 on the previous candle, 0 now) and follow the direction of the breakout.",
  },
  chop: {
    term: "Choppiness",
    short: "From 0 to 100: close to 100, the price goes back and forth without getting anywhere; close to 0, it moves in a straight line. Above 61.8: avoid trend following.",
  },
  obv: {
    term: "OBV (on-balance volume)",
    short: "Adds the volume of rising candles and subtracts that of falling ones. Only its direction matters: an OBV rising while the price stalls can signal quiet buying.",
  },
  mfi: {
    term: "MFI (money flow index)",
    short: "An RSI that takes volume into account, from 0 to 100. Above 80, buying has been very strong; below 20, selling.",
  },
  zscore: {
    term: "Z-score",
    short: "How many standard deviations the price is from its average. Beyond 2 or below −2, the gap is unusual.",
  },
  "bougie-interieure": {
    term: "Inside bar",
    short: "A candle entirely contained in the previous one: the market pauses. The break out of the previous candle often gives the next direction.",
  },
  avalement: {
    term: "Engulfing",
    short: "A candle whose body engulfs the previous one's, of the opposite colour. Equals 1 for a bullish engulfing, −1 for a bearish one.",
    example: "“Engulfing = 1” on a support after a fall: buyers take back control.",
  },
  "pin-bar": {
    term: "Pin bar",
    short: "A candle with a very long wick (at least two thirds of the candle): prices on that side were rejected. Equals 1 for a long lower wick, −1 for a long upper wick.",
  },
  nr7: {
    term: "Narrowest candle (NR7)",
    short: "Equals 1 when the candle has the smallest range of the last N (7 for NR7). Calm often comes before a move.",
  },
  "wma-hma": {
    term: "Weighted (WMA) and Hull (HMA) moving averages",
    short: "The WMA gives more weight to the latest candles than a simple average. The HMA combines several WMAs: as smooth as a long average, with much less lag.",
  },
  source: {
    term: "Indicator source",
    short: "The price an indicator is computed on: the close by default, or hl2 = (high + low) / 2, hlc3 = (high + low + close) / 3, ohlc4 = the average of the four prices.",
    example: "SMA 15 on hl2 = the average of the candle midpoints over the last 15 candles.",
  },
  cci: {
    term: "CCI",
    short: "Measures how far the price is from its average. It mostly moves between −100 and +100: beyond that, the move is unusually strong.",
  },
  "williams-r": {
    term: "Williams %R",
    short: "Places the close within the range of the last N candles, from −100 (at the low) to 0 (at the high). Below −80: oversold; above −20: overbought.",
  },
  dmi: {
    term: "+DI and −DI",
    short: "The two lines that come with the ADX. +DI above −DI: buyers push harder; the reverse: sellers. The ADX only says whether the trend is strong.",
  },
  swing: {
    term: "Swing highs and lows",
    short: "A swing high is a high surrounded by lower candles (5 before, 5 after by default). It's only known once the candles after it have closed: the test never looks ahead.",
    example: "“close crosses above the last swing high” = breakout of the last high.",
  },
  bos: {
    term: "Break of structure (BOS)",
    short: "Equals 1 when a candle closes above the last swing high, −1 below the last swing low, 0 otherwise. “Structure” keeps the side of the last break: 1 bullish, −1 bearish.",
    long: "A change of character (CHoCH) is a break against the structure: “BOS = 1” and “Structure 1 candle ago = −1”.",
  },
  fvg: {
    term: "Fair Value Gap (FVG)",
    short: "A gap left by a fast move over three candles: the third candle's low stays above the first one's high (bullish FVG), or the reverse.",
    long: "“FVG” equals 1 or −1 on the candle that forms the gap. The top and bottom of the zone stay available until a close goes through it, to trade the price coming back into the zone.",
  },
  "order-block": {
    term: "Order block (OB)",
    short: "The last opposite candle before the move that broke the structure: the last bearish candle before the rise that closed above the last swing high (bullish order block), or the reverse.",
    long: "That candle's high and low make the zone. It stays available until a close goes through it or a newer order block replaces it. “Order block” equals 1 the first time the price comes back into the bullish zone, −1 into the bearish zone: each zone gives one signal only. Everything is known at the close: the test never looks ahead.",
    example: "“Order block = 1” on the buy side = buy the first retest of a bullish order block.",
  },
  "heikin-ashi": {
    term: "Heikin Ashi",
    short: "Smoothed candles: the close is the average of the four prices, the open the middle of the previous body. Trends show as long runs of candles of the same color.",
    example: "Green Heikin Ashi candle = “HA close > HA open”.",
  },
  divergence: {
    term: "RSI or MACD divergence",
    short: "The price makes a lower low but the oscillator a higher low (1, bullish), or the reverse on highs (−1, bearish): the move is running out of steam.",
    long: "Both lows or highs are read on the oscillator, 5 to 60 candles apart. The signal comes when the second one is confirmed, a few candles after it.",
  },
  "stoch-rsi": {
    term: "Stoch RSI",
    short: "A stochastic applied to the RSI, from 0 to 100: quicker than the RSI. Below 20: the RSI is at the bottom of its recent range; above 80: at the top.",
  },
  aroon: {
    term: "Aroon",
    short: "Aroon up equals 100 when the high of the last N candles is on the current candle, and falls to 0 as it gets older. Aroon down does the same with the low.",
  },
  cmf: {
    term: "CMF (Chaikin Money Flow)",
    short: "From −1 to 1: above 0, volume traded mostly near the candles' highs (buying); below, near the lows (selling).",
  },
  figures: {
    term: "Candle patterns",
    short: "Shapes of one or two candles that traders watch. On their own they predict little: they matter mostly on a key level and in the direction of the trend.",
  },
  "ut-superieure": {
    term: "Higher timeframe",
    short: "Computing an indicator on longer candles than the strategy's, to filter by the underlying trend.",
    example: "15m strategy, filter “close > SMA 200 on 1d”.",
  },
  decalage: {
    term: "Offset",
    short: "Reading an indicator's value N candles back. Offset 1 = the previous candle.",
  },

  // Risk management
  stop: {
    term: "Stop (stop loss)",
    short: "The price where you cut your loss if the trade goes the wrong way. Essential so as not to lose everything on one trade.",
    long: "In %, in ATR or below the recent low. In Backtest Lab, the distance to the stop is also used to size the position.",
  },
  objectif: {
    term: "Target (take profit)",
    short: "The price where you take your profit automatically.",
  },
  r: {
    term: "R (multiple of risk)",
    short: "Your gain or loss compared with the risk taken. 1R = the loss if the stop is hit. A 2R target makes twice what you risk.",
    example: "You risk $100: a +2R trade makes $200, a −1R trade costs $100.",
  },
  "stop-suiveur": {
    term: "Trailing stop",
    short: "A stop that follows the price when it goes your way, to protect part of the gain.",
  },
  "point-mort": {
    term: "Breakeven stop",
    short: "Moving the stop up to the entry price once the trade is a certain number of R in profit: at worst, you exit at zero.",
  },
  "duree-max": {
    term: "Max duration",
    short: "Closing the trade after N candles if it has hit neither the stop nor the target.",
  },
  "risque-par-trade": {
    term: "Risk per trade",
    short: "The % of your capital lost if the stop is hit. 1% is a good starting point: 10 losses in a row only cost about 10%.",
  },
  taille: {
    term: "Position size",
    short: "The amount committed to a trade. With a stop, it's computed to match your risk per trade; without one, it's a fixed % of capital.",
  },
  levier: {
    term: "Leverage",
    short: "Borrowing to take a bigger position than your capital. It multiplies gains and losses alike.",
    long: "Max leverage caps the computed size. Beyond it, a small drop can liquidate the position.",
  },
  liquidation: {
    term: "Liquidation",
    short: "With leverage, if the loss eats your margin, the platform force-closes your position and you lose the margin.",
  },
  kelly: {
    term: "Kelly criterion",
    short: "A formula giving the risk per trade that would grow capital fastest, if the future looked exactly like the test. Too aggressive in practice: it's a ceiling, not a setting.",
    long: "It starts from the win rate and the ratio of average gain to average loss. As those numbers are estimated on the past, most traders take only a quarter of it, or stay between 0.5 and 2% per trade.",
  },

  // Costs
  frais: {
    term: "Fees",
    short: "What the platform takes on every buy and every sell, as a % of the amount. Paid on entry and on exit.",
  },
  spread: {
    term: "Spread",
    short: "The gap between the buy price and the sell price at the same moment. You pay half on entry and half on exit.",
  },
  glissement: {
    term: "Slippage",
    short: "A market order often fills a little worse than the price shown, especially when things move fast.",
  },
  financement: {
    term: "Funding",
    short: "On perpetual contracts (futures), a small cost paid every 8 hours while the position is open.",
  },
  "taux-equilibre": {
    term: "Breakeven win rate",
    short: "The % of winning trades needed not to lose money, given your average gain and average loss. Fees push it up: each gain is smaller, each loss bigger.",
    example: "An average gain of 2 R for a 1 R loss: one winning trade in three is enough.",
  },

  // Reading the results
  capital: {
    term: "Starting capital",
    short: "The make-believe amount the test starts with. Gains add up trade after trade.",
  },
  rendement: {
    term: "Total return",
    short: "How much the capital made or lost over the whole test period, fees included.",
  },
  "achat-conservation": {
    term: "Buy and hold",
    short: "What you would have made buying at the start and holding to the end, doing nothing. The strategy must do better, or risk much less.",
  },
  "rendement-annuel": {
    term: "Annual return",
    short: "The return brought back to an average year, to compare tests of different lengths.",
  },
  drawdown: {
    term: "Max drawdown",
    short: "The worst fall of capital from a peak. It's the pain you would have had to bear without giving up.",
    example: "−20% on $10,000: at some point, your account went from $10,000 to $8,000.",
  },
  trades: {
    term: "Number of trades",
    short: "How many times the strategy entered a position. Under 30 trades, the result may be luck.",
  },
  gagnants: {
    term: "Win rate",
    short: "The % of trades closed in profit. It's not enough on its own: 30% winners can be very profitable if each gain is worth 3 losses.",
  },
  "profit-factor": {
    term: "Profit factor",
    short: "Total gains divided by total losses. Above 1: the strategy makes money. Above 1.5: it's solid.",
  },
  "gain-moyen": {
    term: "Average gain per trade",
    short: "What a trade makes on average, winners and losers mixed. It must be positive, otherwise the strategy loses over time.",
  },
  sharpe: {
    term: "Sharpe and Sortino",
    short: "Return compared with the swings of the capital. The higher, the smoother the curve. Above 1 is good.",
    long: "The Sortino only counts downward swings.",
  },
  "pertes-affilee": {
    term: "Losses in a row",
    short: "The longest streak of losing trades. Ask yourself whether you would have kept following the strategy after that many losses.",
  },
  exposition: {
    term: "Time in market",
    short: "The % of time you had an open trade. Less time in the market = less risk for the same gain.",
  },
  "courbe-capital": {
    term: "Equity curve",
    short: "How the account changed trade after trade. A curve that rises steadily beats a roller coaster.",
  },
  "analyse-trades": {
    term: "Trade analysis",
    short: "Your trades grouped by hour, by day, by side, by exit reason and around economic announcements, to see whether losses always come from the same place.",
    long: "A group that loses throughout the test is a real weak spot. A group that lost only during one stretch may be luck: removing it makes the past look better without promising anything for the future.",
  },
  "annonces-economiques": {
    term: "Economic announcements",
    short: "The events that move every market at once: Fed and ECB rate decisions, US inflation (CPI) and jobs (NFP) figures.",
    long: "On those days, prices can jump in a few seconds: the spread widens, stops fill further than planned, and a strategy that works on quiet days can lose. A trade counts if it was open at some point on the day of the announcement (New York time, or Frankfurt time for the ECB). The dates come from the official calendars of the Fed, the ECB and the Bureau of Labor Statistics, since 2017.",
    example: "Fed decision at 2pm New York time, CPI and NFP at 8:30am New York time, ECB at 2:15pm Frankfurt time.",
  },
  fomc: {
    term: "Fed (FOMC)",
    short: "The US central bank. Its committee (FOMC) sets the policy rate eight times a year, and sometimes in an emergency, as in March 2020.",
  },
  "cpi-nfp": {
    term: "CPI and NFP",
    short: "Two US figures published every month: inflation (CPI, consumer price index) and job creation (NFP, non-farm payrolls). They change what markets expect from the Fed.",
  },
  "mae-mfe": {
    term: "Worst and best moment (MAE / MFE)",
    short: "How far each trade went against you (MAE) and in your favour (MFE) before closing, in R. It helps place the stop and the exits.",
    example: "If almost no winner drops below −0.5 R, a stop at −1 R may be too far.",
  },

  // Robustness
  surajustement: {
    term: "Overfitting",
    short: "Tuning a strategy until it fits the past perfectly. It looks brilliant in the test and fails afterwards.",
    long: "The beginner's number one trap. The checks in the Robustness tab are there to catch it.",
  },
  avantage: {
    term: "Real edge",
    short: "The test checks whether the average gain could come from luck, by drawing trades at random thousands of times.",
  },
  validation: {
    term: "Study then validation",
    short: "The first 70% of the history on one side, the last 30% on the other. The strategy must win on both.",
  },
  "monte-carlo": {
    term: "Monte Carlo",
    short: "Shuffling the order of the trades thousands of times to see the worst and best possible scenarios with the same trades.",
  },
  "reglages-voisins": {
    term: "Nearby settings",
    short: "Running the test again with each setting changed a little (RSI 12 or 16 instead of 14…). A good strategy also wins with close settings.",
  },
  "frais-doubles": {
    term: "Doubled fees",
    short: "The same test with costs twice as high. If the strategy turns into a loser, its margin is too thin.",
  },
  "prop-firm": {
    term: "Prop firm challenge",
    short: "Firms hand capital to traders who pass an exam (a profit target without exceeding a max loss). This tab estimates your chances.",
    long: "The tab replays your trades with the rules of FTMO, FundedNext and The5ers taken from their websites, and with standard models you can edit. It also counts how many attempts, and so how much in fees, it would take on average to get funded.",
  },
  "perte-max-suiveuse": {
    term: "Trailing max loss",
    short: "A max loss that rises with your account: it locks onto your highest end-of-day balance and never moves back down. Tougher than a fixed max loss.",
    example: "$100,000 account, 10% max loss: the limit is at $90,000. If you end a day at $104,000, it moves to $94,000.",
  },
  "jour-gagnant": {
    term: "Winning day (prop firm)",
    short: "For some prop firms, a day only counts if it makes at least 0.5% of the account. The5ers asks for 3 per step.",
  },

  // Strategy settings
  sens: {
    term: "Direction",
    short: "Whether the strategy buys (bets on a rise), sells short (bets on a fall), or both.",
  },
  "periode-test": {
    term: "Test period",
    short: "The dates between which the strategy is replayed on past prices.",
  },
  horaires: {
    term: "Entry hours",
    short: "Opening trades only between two times (local time), for example during the New York session.",
  },
  valeur: {
    term: "Fixed value",
    short: "A number you choose, to compare an indicator with a threshold: “RSI < 30”, “ADX > 25”.",
  },
  jours: {
    term: "Entry days",
    short: "The days of the week when the strategy may open a trade.",
  },
  "fermer-a": {
    term: "Close everything at",
    short: "The time at which any position still open is closed, whatever happens.",
  },
};

/** "What it's for", by entry id, for the English site. */
export const USES_EN: Record<string, string> = {
  symbole: "Choose the market to test on. The same settings can win on one and lose on another.",
  "unite-de-temps": "The longer it is, the fewer trades and the less fees weigh. 4h or 1d to start with.",
  style: "Label your strategy. It doesn't change the calculation, but helps the AI suggest suitable settings.",
  sens: "Keep “Buy only” to start with: it's the simplest to understand and to trade.",
  fuseau: "So that “9am” or “the previous day” mean the same as on your watch.",
  stop: "Limit the loss of each trade. Without a stop, a single bad trade can wipe out months of gains.",
  objectif: "Take the gain instead of waiting for it to vanish.",
  "stop-suiveur": "Let a winning trade run while protecting part of the gain.",
  "point-mort": "No longer be able to lose on a trade that's already well under way.",
  "duree-max": "Not stay stuck in a trade that's going nowhere.",
  "risque-par-trade": "Decide how much you accept to lose if the stop is hit. It's what sets the position size.",
  taille: "Set the amount committed when there's no stop to compute it.",
  levier: "Cap the size of positions. Low leverage protects against too big a loss.",
  horaires: "Avoid quiet or overly hectic hours, or trade a single session.",
  jours: "Avoid certain days (Mondays, the weekend in crypto…).",
  "fermer-a": "Never hold a position overnight, in day trading.",
  "periode-test": "The longer the period, the more reliable the result: aim for several years.",
  capital: "Give the make-believe account a size, to read the results in dollars.",
  frais: "Make the test realistic: fees often turn a winning strategy into a losing one.",
  spread: "Count the gap between buy and sell that you pay on every trade.",
  glissement: "Count the small gap between the price you wanted and the price you got.",
  financement: "Count the cost of keeping a position open on perpetual contracts or CFDs.",
  bougie: "Compare the price with an indicator or a level: “close > SMA 200” = the price is above its average.",
  valeur: "Set the threshold that triggers the rule.",
  mm: "Know whether the trend is up or down, and filter out trades against it.",
  mme: "Follow the trend more closely than an SMA; crossovers of two EMAs are classic signals.",
  rsi: "Spot a market that has fallen too far (to buy a bounce) or risen too far.",
  atr: "Place a stop or a target at a distance suited to how restless the market is.",
  bollinger: "Spot a price unusually far from its average, or a breakout.",
  macd: "Follow the strength of the trend and its changes.",
  stochastique: "Spot a bounce from the bottom or the top of the recent range.",
  adx: "Only enter when the market is really trending.",
  roc: "Measure momentum: is the price speeding up?",
  ibs: "Buy weak closes hoping for a bounce the next day.",
  vwap: "Know whether the price is expensive or cheap compared with the day.",
  volume: "Check that a move is backed by a lot of trading.",
  niveaux: "Detect a break of the recent high or low.",
  veille: "Lean on the levels many traders watch.",
  croise: "Fire only at the moment of the crossover, not for as long as the condition stays true.",
  semaine: "Target or trade the break of the week's levels, in swing trading.",
  "plage-horaire": "Trade the break of the opening range, or of the overnight range.",
  pivots: "Have targets and supports computed for the day.",
  camarilla: "Play the return to the centre at R3 / S3, or the breakout of R4 / S4.",
  supertrend: "Follow the trend and know where to put a trailing stop.",
  psar: "Spot a trend reversal or follow a tightening stop.",
  ichimoku: "Judge trend, momentum and supports at a glance.",
  keltner: "Spot a volatility breakout or a pullback to the average.",
  "bollinger-b": "Write simple rules on the position within the bands, or spot very tight bands.",
  squeeze: "Get ready before a move that comes out of a quiet period.",
  chop: "Choose between a trend strategy and a range strategy.",
  obv: "Check that volume goes along with the rise or the fall.",
  mfi: "Spot excesses while taking volume into account.",
  zscore: "Spot a price unusually far from its average, for a mean reversion.",
  "bougie-interieure": "Enter on the break of a pause, in the direction of the trend.",
  avalement: "Spot a quick reversal in the balance of power.",
  "pin-bar": "Spot a clear rejection of a level.",
  nr7: "Anticipate a breakout after a calm period.",
  "wma-hma": "Follow the trend with less lag than a simple average.",
  source: "Compute an average on the candle midpoints rather than the close, as on TradingView.",
  cci: "Spot a price excess, or the momentum at the start of a move.",
  "williams-r": "Spot a bounce from the bottom or top of the recent range.",
  dmi: "Know which side a strong trend is pushing.",
  swing: "Set breakout or stop levels on the latest highs and lows.",
  bos: "Follow the market structure, as in Smart Money Concepts.",
  fvg: "Wait for the price to come back into an imbalance to enter.",
  "order-block": "Enter when the price comes back to the zone the move started from, as in ICT.",
  "heikin-ashi": "Filter out noise and stay in the trend longer.",
  divergence: "Spot a loss of momentum before a reversal.",
  "stoch-rsi": "Time an entry in a pullback.",
  aroon: "Tell whether a trend is starting or fading.",
  cmf: "Check that volume confirms the direction.",
};
