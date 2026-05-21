:::cover-page{title="Investor One-Pager — Q1 2026" subtitle="A polished example of the new document system with interactive charts" date="2026-05-21" author="Manav S" recipient="Acme Capital" logo="auto"}
:::

# Executive Summary

This document demonstrates Phase 1B — every chart below is a real interactive Recharts visualization with brand color theming. They print cleanly to PDF too.

:::callout{tone="success" title="Phase 1B Shipped"}
The chart directive now renders 7 chart types via Recharts: line, area, bar, stackedBar, pie, scatter, milestone. Data can be inline JSON in a fenced code block OR (Phase 1D) pulled live from the Data Room.
:::

## Key Metrics

::kpi{label="MRR" value="$48,200" trend="+18%" sublabel="Monthly recurring"}
::kpi{label="Active Clients" value="32" trend="+4" sublabel="Last 30 days"}
::kpi{label="Net Retention" value="118%" trend="+2%" sublabel="12-month rolling"}

## Revenue Growth — line chart

:::chart{type="line" title="MRR Growth — Last 12 Months" xKey="month" yKey="mrr" footnote="Source: Stripe + manual reconciliation"}
```json
[
  {"month": "Jun", "mrr": 12500},
  {"month": "Jul", "mrr": 14200},
  {"month": "Aug", "mrr": 16800},
  {"month": "Sep", "mrr": 19500},
  {"month": "Oct", "mrr": 23100},
  {"month": "Nov", "mrr": 27600},
  {"month": "Dec", "mrr": 31200},
  {"month": "Jan", "mrr": 35800},
  {"month": "Feb", "mrr": 39400},
  {"month": "Mar", "mrr": 42100},
  {"month": "Apr", "mrr": 45300},
  {"month": "May", "mrr": 48200}
]
```
:::

## Revenue Composition — stacked bar

:::chart{type="stackedBar" title="Revenue by Tier — Last 6 Months" xKey="month" yKeys="enterprise,growth,starter"}
```json
[
  {"month": "Dec", "enterprise": 8400, "growth": 14200, "starter": 8600},
  {"month": "Jan", "enterprise": 11200, "growth": 16100, "starter": 8500},
  {"month": "Feb", "enterprise": 13500, "growth": 17400, "starter": 8500},
  {"month": "Mar", "enterprise": 15800, "growth": 17800, "starter": 8500},
  {"month": "Apr", "enterprise": 18200, "growth": 18600, "starter": 8500},
  {"month": "May", "enterprise": 21400, "growth": 18300, "starter": 8500}
]
```
:::

## Customer growth — area chart

:::chart{type="area" title="Active Customers — Cumulative" xKey="month" yKey="count"}
```json
[
  {"month": "Jun", "count": 8},
  {"month": "Jul", "count": 11},
  {"month": "Aug", "count": 14},
  {"month": "Sep", "count": 17},
  {"month": "Oct", "count": 20},
  {"month": "Nov", "count": 23},
  {"month": "Dec", "count": 25},
  {"month": "Jan", "count": 27},
  {"month": "Feb", "count": 28},
  {"month": "Mar", "count": 30},
  {"month": "Apr", "count": 31},
  {"month": "May", "count": 32}
]
```
:::

::page-break

## Market Share — pie chart

:::chart{type="pie" title="Estimated Q1 2026 Market Share" nameKey="company" valueKey="share"}
```json
[
  {"company": "Us", "share": 18},
  {"company": "Competitor A", "share": 32},
  {"company": "Competitor B", "share": 24},
  {"company": "Competitor C", "share": 14},
  {"company": "Others", "share": 12}
]
```
:::

## Roadmap — milestone timeline

:::chart{type="milestone" title="Product Roadmap" xKey="date"}
```json
[
  {"date": "Q1-2025", "label": "Founded", "status": "done"},
  {"date": "Q3-2025", "label": "Seed round", "status": "done"},
  {"date": "Q1-2026", "label": "100 customers", "status": "done"},
  {"date": "Q3-2026", "label": "Series A", "status": "in-progress"},
  {"date": "Q1-2027", "label": "Enterprise tier", "status": "upcoming"},
  {"date": "Q3-2027", "label": "EU expansion", "status": "upcoming"}
]
```
:::

## Comparison — multi-series line

:::chart{type="line" title="Acquisition Channels — Last 6 Months" xKey="month" yKeys="organic,paid,referral"}
```json
[
  {"month": "Dec", "organic": 12, "paid": 8, "referral": 4},
  {"month": "Jan", "organic": 18, "paid": 10, "referral": 6},
  {"month": "Feb", "organic": 24, "paid": 9, "referral": 9},
  {"month": "Mar", "organic": 31, "paid": 11, "referral": 12},
  {"month": "Apr", "organic": 38, "paid": 13, "referral": 14},
  {"month": "May", "organic": 47, "paid": 12, "referral": 18}
]
```
:::

## What customers are saying

:::quote{author="Sarah Chen" role="VP Marketing, TechCorp" source="Q1 case study"}
Brand Studio has fundamentally changed how we prepare investor materials. What used to take a week of back-and-forth now happens in an afternoon — and the output is genuinely investor-grade.
:::

## Risks and mitigations

:::callout{tone="warning" title="Watch: Q3 churn signal"}
We're tracking elevated churn in the sub-$1k MRR segment. Mitigation: dedicated onboarding sequence rolling out in May.
:::

:::callout{tone="critical" title="Material disclosure"}
Three pending regulatory items in EU markets. Detailed in Appendix B of the supporting documentation.
:::

---

:::signature{name="Manav S" title="Founder" date="2026-05-21"}

::footer-meta{text="Confidential — for Acme Capital only" showPageNumber=true}
