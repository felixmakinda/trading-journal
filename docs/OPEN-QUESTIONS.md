# Open questions for the trader

From section 7 of the proposal. Answers already given are recorded in `DECISIONS.md`. Until the rest are answered, the app uses the default shown, and every default is a setting he can change in the app.

| # | Question | Status | Default until answered |
|---|----------|--------|------------------------|
| 1 | Razor account on cTrader via TradingView? Any MT4/MT5 too? | Open | cTrader only; MT4/MT5 via CSV import |
| 2 | How trades come in | **Answered:** automatic sync with manual updates | |
| 3 | Where it lives | **Answered:** online (Vercel + Supabase) | |
| 4 | Prop-firm or funded accounts? Firm and drawdown rules? | Open | Tracker off; limits configurable in Settings |
| 5 | Will he write pre-trade plans? | Open | Plans optional; unplanned trades still sync |
| 6 | AI coach preference | Deferred (ADR 008) | Free tier first |
| 7 | Monthly budget for hosting and AI | Open | Stay on free tiers |
| 8 | Account currency and sessions traded | Open | USD; Africa/Nairobi time; all sessions |
| 9 | Top 3 features first | Open | Dashboard, calendar, auto-sync |
| 10 | Likes and dislikes about other journals | Open | |

## Things we need from him

- [ ] A few Pepperstone statements or TradingView history exports, to test importers against real files.
- [ ] His trading rules and setups, to seed the pre-trade checklist.
- [ ] 15 minutes to connect his cTrader ID once the app is deployed.

## Things we need to do (not him)

- [ ] Register an app at https://openapi.ctrader.com (client ID and secret, redirect URI). Approval by Spotware may take a few days, so do this first.
- [ ] Create the Supabase project and the Vercel project, and add the environment variables from `.env.example`.
