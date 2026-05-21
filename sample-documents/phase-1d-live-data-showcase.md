:::cover-page{title="Q1 Performance Review" subtitle="Live data — every number pulled at view time" date="2026-05-21" author="Manav S" recipient="Acme Capital" logo="auto"}
:::

# Performance snapshot

These KPIs all pull live from your Data Room — when the underlying values change, this document reflects them on next open.

::kpi{from="dataroom.analytics.gsc_total_clicks" label="GSC Clicks" sublabel="Last 28 days"}
::kpi{from="dataroom.analytics.gsc_total_impressions" label="Impressions" sublabel="Last 28 days"}
::kpi{from="dataroom.analytics.organic_sessions_monthly" label="Organic sessions" sublabel="Monthly"}

## Health scores over time

The chart below pulls the project's `metrics` table (health scores by date):

:::chart{type="line" from="metrics.llm_visibility_score" range="last_90d" title="LLM Visibility — last 90 days"}
:::

:::chart{type="area" from="metrics.overall_growth_score" range="last_90d" title="Overall growth score" footnote="Auto-pulled — source: metrics.overall_growth_score"}
:::

## Multiple health metrics, side by side

::kpi{from="metrics.algorithm_health_score" label="Algorithm Health"}
::kpi{from="metrics.eeat_score" label="E-E-A-T"}
::kpi{from="metrics.content_authority_score" label="Content Authority"}
::kpi{from="metrics.brand_mentions" label="Brand mentions" sublabel="Most recent"}

::page-break

## Revenue snapshot

:::data-table{from="revenue.records" columns="period_year,period_month,amount,currency,status,record_type" title="Recent revenue records" limit="12"}
:::

## Inline data — fallback when no live source

The directive system still supports inline JSON. This chart has no `from` attribute — it uses the JSON code block directly:

:::chart{type="bar" title="Quarterly target — inline data" xKey="quarter" yKey="target"}
```json
[
  {"quarter": "Q1", "target": 250},
  {"quarter": "Q2", "target": 320},
  {"quarter": "Q3", "target": 410},
  {"quarter": "Q4", "target": 500}
]
```
:::

:::callout{tone="info" title="Reading this document"}
KPI cards with a `from=` attribute show "Data not found" if the field doesn't exist in this project's Data Room yet. Configure them in Brand Studio → Data Room tab to make the numbers light up.
:::

::footer-meta{text="Confidential — for Acme Capital only" showPageNumber=true}
