# Stock Analysis Request

Analyze the following multi-source stock data and provide your top 10 stock recommendations with comprehensive technical analysis:

## Strategy Parameters

- Strategy: {{STRATEGY_NAME}}
- Time Horizon: {{TIME_HORIZON}}
- Target Return: {{TARGET_RETURN_PCT}}%
- Risk Level: {{RISK_LEVEL}}
- Custom Instructions: {{CUSTOM_PROMPT}}

## Budget Information

- Monthly Budget: ${{MONTHLY_BUDGET}}
- Current Month Spent: ${{CURRENT_MONTH_SPENT}}
- Remaining Budget: ${{REMAINING_BUDGET}}
- Per Stock Allocation: ${{PER_STOCK_ALLOCATION}}
- Available Investment Slots: {{AVAILABLE_SLOTS}} stocks
- Budget Utilization: {{BUDGET_UTILIZATION_PCT}}%
- Has Budget: {{HAS_BUDGET}}

**IMPORTANT**: Only recommend stocks if remaining budget >= per stock allocation. Consider available_slots when selecting how many stocks to recommend. If available_slots is limited, prioritize highest confidence/reward opportunities.

## Multi-Source Data

{{SOURCES_JSON}}

## Active Predictions

{{ACTIVE_PREDICTIONS_JSON}}

## Response Format

Provide EXACTLY 10 stock recommendations in this JSON format:

{{JSON_FORMAT_EXAMPLE}}

## Technical Analysis Requirements

1. Base technical analysis on actual data from sources (price, volume, change percentages)
2. Calculate support/resistance levels from price data where available
3. Include chart_points array with specific price levels for chart generation
4. Extract volume analysis from source data (if available)
5. Calculate or estimate RSI, moving averages, momentum based on price movements
6. Identify chart patterns (uptrend, downtrend, consolidation, breakout, etc.)
7. Trace technical indicators back to source data in source_tracing
8. Ensure all price values are numbers, not strings
9. Technical analysis should be actionable for chart generation

## Confidence & Risk Assessment Requirements

1. **confidence_level**: decimal 0.0-1.0 representing confidence in recommendation (based on data quality, signal strength, source agreement)
2. **confidence_pct**: percentage 0-100 (same as confidence_level * 100)
3. **risk_level**: string - one of 'low', 'medium', 'high' based on volatility, stop loss distance, price stability
4. **risk_score**: number 1-10 where 1=very low risk, 10=very high risk
5. **success_probability**: decimal 0.0-1.0 representing probability of hitting target price based on technical analysis and signals
6. **hit_probability_pct**: percentage 0-100 (same as success_probability * 100)
7. Consider: data source agreement, signal strength, volume confirmation, price stability, stop loss distance

## Output Requirements

Return ONLY valid JSON, no markdown formatting. Ensure all prices are numbers, not strings.

