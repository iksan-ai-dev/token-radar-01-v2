# token-radar-01-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/iksan-ai-dev/token-radar-01-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/iksan-ai-dev/token-radar-01-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar: every one of the snapshot's 758 protocols is accounted for, and the 197 pre-token candidates left after the venue/wrapper rule are ranked by the value a token would carry if it traded like the snapshot's own tokened protocols at the same TVL.

The page does not assert that number, it recomputes it in front of you. Every row opens to its full decomposition — TVL × a size curve fitted to the 128 tokened comparables × a shrunk category adjustment × three shrunk tilts = implied value — with each factor printed to four decimals, plus its three nearest comparables priced at their own TVL and each one's error shown rather than summarised. A leave-one-out refit (×3.40 median fold error against the ×4.86 flat median it replaces) is printed next to the model, and the funnel that reconciles 758 protocols to 197 ranked rows is printed in full.

## Run it

```sh
node main.ts
```

Writes `board.json`, `dossier.json` and `dashboard/` (page + `data.js`) from `input/snapshot.json`. Open `dashboard/index.html` with any static server.

## What the model is, and what it is not

- **Fit, not forecast.** The curve is OLS of log₁₀(mcap/TVL) on log₁₀(TVL) over the snapshot's tokened protocols: nothing else enters it. The residual SD is 0.9092 in log₁₀, so the P25–P75 band is ÷4.1 to ×4.1 and it is printed on every row.
- **Shrunk, not tuned.** Growth, age and breadth enter at coefficient × t²/(t²+1) × 0.5, so a term the data does not support cannot overrule the comparables. The unshrunk growth multiplier at weight 0.5 was rejected: it cost rank correlation and inflated out-of-sample error.
- **Circulating, not diluted.** Market cap is circulating, so a new token's FDV usually runs 2–5× these figures; the implied values are conservative on that axis.
- **No promise.** No launch, date or airdrop is predicted. Farm steps say "may qualify" and "positions for", never "will receive".

Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

---

<sub>Entered on [make.fun](https://make.fun/?ref=7xcrs94z&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
