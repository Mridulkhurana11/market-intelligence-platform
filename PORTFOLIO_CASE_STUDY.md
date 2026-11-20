# Portfolio case-study brief

## Title

**Market Intelligence & Competitive Analysis: Category Opportunity and Seller Benchmarking**

## Executive question

Within the observed Olist marketplace sample, which product categories combine meaningful demand with attractive relative signals, and how concentrated is the seller landscape in those categories?

## Role to present

Business Analyst / Market Intelligence Analyst working on a self-initiated analytical case study.

## What was done

- Integrated eight linked CSV tables spanning orders, item lines, customers, sellers, products, payments, reviews and category translation.
- Defined a consistent item-level analytical grain and controlled join fan-out by pre-aggregating order-level payments and review scores.
- Restricted the core GMV analysis to delivered orders and reported freight separately.
- Built category and seller benchmarks, including within-sample shares and HHI concentration measures.
- Compared latest-year-to-date results with the equivalent prior-year calendar window.
- Built a transparent category opportunity screening index with documented weights.
- Used K-Means to explore seller groups from scale, assortment and buyer-reach signals.
- Published aggregated results through a Vite dashboard.

## Decision-oriented outputs

1. Which categories contribute the largest share of observed delivered GMV?
2. Which categories show the strongest relative opportunity score, and what drives the score?
3. How much of the observed platform GMV is represented by the top sellers?
4. Which categories have high concentration or low seller breadth?
5. What buyer-experience signals (reviews, delivery) deserve follow-up investigation?

## Important caveats to state in an interview

- This is one marketplace operator's historical and anonymised sample, not the Brazilian e-commerce market as a whole.
- Seller/category share is within the Olist sample only.
- Opportunity index weights are analyst-defined and should be sensitivity-tested.
- The opportunity score is not TAM, a forecast, or a recommendation to invest.
- Review records are at order grain and are not allocated to individual sellers when orders can contain more than one seller.
- Seller K-Means clusters are exploratory; they are not ground-truth merchant segments.
- The data licence is CC BY-NC-SA 4.0 and therefore has a non-commercial restriction.

## How to talk about impact honestly

Do not claim business savings or revenue uplift because this is not a commissioned intervention. Explain the analytical process, the evidence produced, the decision questions the dashboard helps answer, and what additional data would be required before a real market-entry or investment decision.
