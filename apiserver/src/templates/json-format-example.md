```json
{
  "top_stocks": [
    {
      "symbol": "AAPL",
      "entry_price": 150.00,
      "target_price": 165.00,
      "stop_loss_price": 142.50,
      "reasoning": "Detailed explanation...",
      "source_tracing": [
        {
          "source": "alpha_vantage",
          "contribution": "Top gainer with 5% increase",
          "data": {...}
        }
      ],
      "technical_analysis": {
        "trend": "bullish",
        "trend_strength": "strong",
        "support_level": 148.00,
        "resistance_level": 168.00,
        "current_price": 150.25,
        "price_change_pct": 2.5,
        "volume_analysis": "increasing",
        "volume_data": {
          "recent_volume": 1000000,
          "average_volume": 800000,
          "volume_trend": "above_average"
        },
        "price_levels": [
          {"level": 148.00, "type": "support", "strength": "strong"},
          {"level": 152.00, "type": "minor_resistance", "strength": "weak"},
          {"level": 168.00, "type": "resistance", "strength": "strong"}
        ],
        "indicators": {
          "rsi": 65.5,
          "rsi_signal": "neutral_to_bullish",
          "moving_average": {
            "sma_20": 148.50,
            "sma_50": 145.00,
            "position_vs_ma": "above_both"
          },
          "momentum": "positive"
        },
        "chart_pattern": "uptrend_continuation",
        "chart_points": [
          {"price": 148.00, "label": "Support", "type": "horizontal_line"},
          {"price": 152.00, "label": "Entry Zone", "type": "area"},
          {"price": 168.00, "label": "Target", "type": "horizontal_line"}
        ],
        "timeframe_analysis": {
          "short_term": "bullish",
          "medium_term": "bullish",
          "long_term": "neutral"
        },
        "data_sources_used": ["alpha_vantage", "reddit"],
        "analysis_notes": "Technical analysis based on price data from Alpha Vantage and sentiment from Reddit discussions"
      },
      "sentiment_score": 7.5,
      "overall_score": 8.2,
      "confidence_level": 0.75,
      "confidence_pct": 75,
      "risk_level": "medium",
      "risk_score": 5.5,
      "success_probability": 0.72,
      "hit_probability_pct": 72,
      "analysis": "Comprehensive analysis text...",
      "risk_assessment": "Medium risk with moderate confidence..."
    }
  ],
  "metadata": {
    "sources_used": ["alpha_vantage", "reddit", ...],
    "analysis_date": "{{ANALYSIS_DATE}}",
    "stocks_considered": 50
  }
}
```

