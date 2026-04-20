# Model Router Validation Methodology

This document describes how to validate routing strategies and measure their effectiveness.

## Why Validation Matters

Routing is a prediction task: given a prompt, predict the optimal model. Like any ML system, we need to measure accuracy, identify failure modes, and quantify improvement over baselines.

## Validation Approach

### 1. Data Collection

The router logs every decision and outcome to SQLite:

```sql
decisions: prompt features + model selected + reasoning
outcomes: success/error + tokens + latency + cost
```

This creates a labeled dataset: **features → model → outcome**

### 2. Train/Test Split

The validation tool uses an **80/20 temporal split**:
- Last 80% of decisions = training set
- Most recent 20% = held-out test set

Why temporal? Because we want to test on **future** data (realistic deployment).

### 3. Metrics

#### Overall Accuracy
```
accuracy = correct_predictions / total_predictions
```

Baseline:
- **Random**: 33% (3 models)
- **Rule-based**: varies, typically 60-80%
- **ML classifier**: should beat rule-based after 50+ samples
- **LLM routing**: typically 80-95%

#### Per-Model Accuracy

Shows which models the strategy predicts well:
```
haiku:  80% (4/5 correct)
sonnet: 60% (6/10 correct)
opus:   90% (9/10 correct)
```

Useful for identifying bias (e.g., over-predicting sonnet).

#### Confusion Matrix

Shows **where** the strategy makes mistakes:

```
              Predicted
        haiku  sonnet  opus
haiku      8     2     0    ← 2 haiku tasks routed to sonnet
sonnet     1    12     2    ← mostly correct
opus       0     1     9    ← 1 opus task routed to sonnet
```

### 4. Validation Command

```bash
npm run validate
```

**Requirements:**
- At least 20 successful decisions in the database
- Outcomes logged (via Stop hook)

**Output:**
```
📊 ML Classifier Validation
   Training set: 80 samples
   Test set: 20 samples

Overall Accuracy: 75.0%
   (15/20 correct)

Per-Model Accuracy:
   haiku    66.7%  █████████████  (4/6)
   sonnet   80.0%  ████████████████  (8/10)
   opus     75.0%  ███████████████  (3/4)

Confusion Matrix:
              Predicted
        haiku  sonnet  opus
haiku      4     2     0
sonnet     1     8     1
opus       0     1     3

Interpretation:
⚠️  Good - ML classifier is useful but has room for improvement
```

## Strategy Comparison

To compare strategies, run validation after switching:

### Compare Rule-Based vs ML

1. **Test rule-based** (collect data):
   ```yaml
   # config.yaml
   routing:
     strategy: rule-based
   ```
   Use Claude Code normally for 50+ prompts.

2. **Validate rule-based**:
   ```bash
   npm run validate
   ```
   Note the accuracy (e.g., 70%).

3. **Switch to ML classifier**:
   ```yaml
   routing:
     strategy: ml-classifier
   ```

4. **Validate ML classifier**:
   ```bash
   npm run validate
   ```
   Compare accuracy to rule-based.

### Bootstrapping Confidence Intervals

For more robust comparison:

```bash
# Run validation 100 times with different random splits
for i in {1..100}; do
  npm run validate >> validation_results.txt
done

# Analyze distribution of accuracies
grep "Overall Accuracy" validation_results.txt | awk '{print $3}' | sort -n
```

## Interpreting Results

### Accuracy Thresholds

| Accuracy | Assessment | Action |
|----------|------------|--------|
| < 40% | Poor | Strategy is broken, fall back to rule-based |
| 40-60% | Fair | Strategy is learning but not production-ready |
| 60-80% | Good | Strategy is useful, monitor for improvement |
| 80-95% | Excellent | Strategy is working very well |
| > 95% | Suspicious | Likely overfitting or data leakage |

### Common Issues

**Low haiku accuracy**:
- Too few haiku examples in training data
- Features don't distinguish simple tasks well
- Consider adding more question-detection signals

**High sonnet bias** (everything predicted as sonnet):
- Imbalanced training data (too many sonnet examples)
- Add class weights or undersample sonnet

**Low opus accuracy**:
- Rare in training data (users avoid it due to cost)
- Complex signals hard to detect from features alone
- Consider LLM routing for high-stakes tasks

## Cost-Adjusted Metrics

Accuracy alone isn't enough. We also care about **cost efficiency**:

### Cost Savings vs Oracle

Oracle = always pick the cheapest model that succeeds.

```
savings = oracle_cost - actual_cost
```

### Cost-Weighted Accuracy

Penalize expensive mistakes more:

```
wrong_haiku_as_opus = -10 points (way overprovisioned)
wrong_opus_as_haiku = -2 points (will escalate anyway)
correct = +1 point
```

This is **not implemented yet** but would be valuable.

## A/B Testing in Production

For production validation:

1. **Route 90% with strategy A, 10% with strategy B**
2. **Log strategy used** in decisions table
3. **Compare outcomes**:
   - Success rate
   - Average cost
   - Escalation rate
   - User satisfaction (if measurable)

## Feedback Loop Effectiveness

The adaptive escalation adds another validation dimension:

### Escalation Rate

```sql
SELECT 
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM decisions) as escalation_pct
FROM decisions 
WHERE escalated_from IS NOT NULL;
```

**Target**: < 10% escalation rate

High escalation means the router is frequently wrong.

### Time-to-Convergence

How many requests before the failure rate stabilizes?

```sql
SELECT 
  CAST(timestamp / (1000 * 60 * 60) AS INT) as hour,
  AVG(CASE WHEN escalated_from IS NOT NULL THEN 1.0 ELSE 0.0 END) as escalation_rate
FROM decisions
GROUP BY hour
ORDER BY hour;
```

Plot over time to see if system learns.

## Validation Checklist

Before declaring a strategy production-ready:

- [ ] Overall accuracy > 60% on held-out test set
- [ ] Per-model accuracy balanced (no one model < 40%)
- [ ] Tested on at least 100 real decisions
- [ ] Confusion matrix shows sensible errors
- [ ] Cost savings vs oracle > 30%
- [ ] Escalation rate < 15%
- [ ] No catastrophic failures (opus routed to haiku for critical tasks)

## Continuous Validation

Set up a cron job or GitHub Action to validate weekly:

```bash
# .github/workflows/validation.yml
- name: Validate classifier
  run: npm run validate
  if: github.event_name == 'schedule'
```

Track accuracy over time as the system learns.

## Publishing Results

When publishing routing performance:

### Required Information

1. **Dataset size**: number of training/test samples
2. **Time period**: when data was collected
3. **Strategies compared**: rule-based, ML, LLM
4. **Metrics**: accuracy, confusion matrix, cost savings
5. **Task distribution**: % haiku/sonnet/opus in test set
6. **Features used**: which signals feed into routing

### Example Results Table

| Strategy | Accuracy | Haiku | Sonnet | Opus | Avg Cost | Escalation % |
|----------|----------|-------|--------|------|----------|--------------|
| Random | 33% | 33% | 33% | 33% | $0.025 | 67% |
| Rule-based | 72% | 80% | 70% | 65% | $0.012 | 12% |
| ML Classifier | 78% | 75% | 82% | 75% | $0.011 | 8% |
| LLM Routing | 89% | 90% | 88% | 90% | $0.010 | 4% |

*100 test samples, collected over 2 weeks of active development*

### Reproducing Results

Include:
- Link to validation tool code
- Sample dataset (anonymized)
- Config used
- npm run validate output

## Future Improvements

1. **Cross-validation**: k-fold instead of single split
2. **Feature importance**: which features matter most?
3. **Online learning**: update model as new data arrives
4. **Multi-objective optimization**: accuracy + cost + latency
5. **Stratified sampling**: ensure balanced train/test splits
6. **Temporal cross-validation**: multiple time-based splits

## Questions?

- Why not cross-entropy loss? → Classification problem, accuracy is interpretable
- Why not F1 score? → Classes are balanced enough, accuracy suffices
- Why temporal split? → Tests generalization to future prompts (real use case)
- Why not more features? → Hook must be fast (<10ms), limited feature extraction time

## Links

- Validation tool: `src/validate-classifier.ts`
- Database schema: `docs/SPEC.md`
- Strategy implementations: `src/strategies/`
