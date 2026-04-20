# Baseline Model

## What is this?

`baseline.json` contains pre-trained weights for the ML classifier, trained on **55 synthetic prompt samples** representing typical Claude Code usage patterns.

## When is it used?

The ML classifier automatically uses the baseline when:
- User has **< 10 successful decisions** in their outcomes table
- No custom-trained model exists yet

Once you have 10+ outcomes, the classifier trains on **your real data** and ignores the baseline.

## Training Data

**Distribution:**
- 15 haiku samples (simple questions, greetings)
- 20 sonnet samples (standard coding tasks, features, bug fixes)
- 20 opus samples (refactors, architecture, security reviews)

**Examples:**
- Haiku: "what is the difference between const and let"
- Sonnet: "add a new endpoint for user authentication"
- Opus: "refactor the entire authentication system to use OAuth2"

## Performance

**Training accuracy**: 85.5% (47/55 correct)

This is on synthetic data. Real-world accuracy will vary based on your usage patterns.

## Features Used

1. **wordCount** (normalized, /100)
2. **hasQuestion** (0 or 1)
3. **hasActionVerb** (0 or 1)
4. **hasComplexSignal** (0 or 1)
5. **estimatedTokens** (normalized, /1000)

## Regenerating the Baseline

If you want to update the baseline with new synthetic samples:

```bash
# Edit src/generate-baseline.ts to add/modify samples
npm run generate-baseline
```

The new baseline will be written to `models/baseline.json`.

## Why Check This In?

**Pros:**
- New users get better-than-random routing immediately
- Reproducible starting point for all users
- Benchmark to compare against

**Cons:**
- Might not match your specific workload
- Adds ~1KB to the repo

## Should I Use This or Train My Own?

**Use baseline if:**
- You're just starting (< 10 decisions)
- You want consistent behavior across fresh installs

**Train your own if:**
- You have 10+ outcomes (automatic)
- Your prompts differ significantly from typical coding tasks
- You want maximum accuracy for your specific use case

## Metadata

```json
{
  "version": "1.0.0",
  "totalSamples": 55,
  "distribution": {
    "haiku": 15,
    "sonnet": 20,
    "opus": 20
  },
  "trainingAccuracy": 0.855,
  "features": [
    "wordCount",
    "hasQuestion",
    "hasActionVerb",
    "hasComplexSignal",
    "estimatedTokens"
  ]
}
```

## Validating the Baseline

To test the baseline model against real data:

```bash
# 1. Delete your outcomes (backup first!)
rm data/router.db

# 2. Use the system with baseline routing
# config.yaml: routing.strategy = ml-classifier

# 3. After 50+ prompts, validate
npm run validate
```

The validation will show if the baseline generalizes to your workload.
