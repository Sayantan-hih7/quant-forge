import json
from pathlib import Path
from quantforge.trading_costs import trade_fee

def test_nse_2026_rates_match_shared_independent_paise_fixtures():
    cases=json.loads((Path(__file__).resolve().parents[2]/'backend/test/fixtures/cash-costs.json').read_text())
    for row in cases:
        assert trade_fee(row['gross'],row['side'],dict(costModel='indian-cash',overnight=row['overnight'],feePercent=0))==row['expected']
