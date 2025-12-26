# Activity Classification System
## Deep Dive: Models, Datasets & AI Integration Strategies

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Hybrid Architecture](#hybrid-architecture)
3. [Pre-trained Models](#pre-trained-models)
4. [Datasets](#datasets)
5. [AI/LLM Approach](#aillm-approach)
6. [Implementation Recommendation](#implementation-recommendation)

---

## 🎯 Overview

### The Core Problem

Your behavioral monitoring system captures URLs and application usage, but raw data is meaningless without context. You need to automatically determine whether a student is doing:
- **Academic work** (related to studies)
- **Distractions** (entertainment/non-academic)
- **Neutral/idle** state (productivity tools, communication)

### Why Manual URL Lists Fail

You mentioned manually defining academic/non-academic URLs in extension settings. Here's why this approach doesn't scale:

- ❌ Cannot scale to millions of possible URLs
- ❌ Misses new websites and subdomains
- ❌ Same domain can be academic AND non-academic (e.g., YouTube)
- ❌ Requires constant manual updates
- ❌ No context awareness (time of day, user's courses, etc.)

### The Solution: Multi-Layer Hybrid Classification

Combine multiple approaches in a cascading architecture. Each layer handles what it's best at, and uncertain cases fall through to the next layer.

**Benefits:**
- ⚡ **Speed** - Rules are fast (< 1ms)
- 🎯 **Accuracy** - ML catches edge cases
- 🔄 **Adaptability** - AI handles unknown cases

### 🔑 Key Insight: AI is NOT a Silver Bullet

You're right to question "AI only" approaches. LLMs are powerful but have drawbacks:
- **Latency**: API calls take 500ms+
- **Cost**: Per-token pricing adds up
- **Inconsistency**: Same input can get different outputs

The best approach uses AI **strategically** – as one layer in a hybrid system, not as the sole classifier.

---

## 🗂️ Hybrid Architecture

### Recommended 5-Layer Cascading System

#### Layer 1: Hardcoded Domain Rules
- **Speed**: < 1ms
- **Accuracy**: 100%
- **Coverage**: ~40%
- **Description**: Instant lookup for known domains (google.scholar, facebook.com, etc.)

#### Layer 2: URL Path Analysis
- **Speed**: < 5ms
- **Accuracy**: ~90%
- **Coverage**: ~15%
- **Description**: Parse URL structure for ambiguous domains (youtube.com/watch → check video category)

#### Layer 3: Lightweight ML Model
- **Speed**: ~20ms
- **Accuracy**: ~85%
- **Coverage**: ~30%
- **Description**: TF-IDF + classifier on page title/domain (runs locally, no network)

#### Layer 4: Local LLM (Ollama)
- **Speed**: ~500ms
- **Accuracy**: ~92%
- **Coverage**: ~10%
- **Description**: For complex cases: "Is studying React on YouTube academic for a CS student?"

#### Layer 5: User Feedback Loop
- **Speed**: N/A
- **Accuracy**: 100%
- **Coverage**: ~5%
- **Description**: Manual corrections that improve Layer 1-3 over time

### Flow Logic

```javascript
function classifyActivity(url, title, userContext) {
  // Layer 1: Check hardcoded rules (instant)
  let result = domainRulesDB.lookup(getDomain(url));
  if (result.confidence > 0.95) return result;
  
  // Layer 2: URL path analysis (for ambiguous domains)
  if (isAmbiguousDomain(url)) {
    result = analyzeURLPath(url, title);
    if (result.confidence > 0.85) return result;
  }
  
  // Layer 3: ML model (local, fast)
  result = mlClassifier.predict(title, getDomain(url));
  if (result.confidence > 0.80) return result;
  
  // Layer 4: LLM for complex cases (slower but smarter)
  result = await localLLM.classify(url, title, userContext);
  if (result.confidence > 0.75) return result;
  
  // Default: Mark as "neutral" and queue for user feedback
  return { category: 'neutral', needsFeedback: true };
}
```

---

## 🤖 Pre-trained Models

### 🏆 Homepage2Vec (Recommended for Websites)

The most relevant pre-trained model for your use case. Developed by EPFL, it classifies websites into 14 categories with 90% F1-score.

**Resources:**
- GitHub: https://github.com/epfl-dlab/homepage2vec
- PyPI: https://pypi.org/project/homepage2vec/
- Paper: https://arxiv.org/abs/2201.03677

**Categories**: Arts, Business, Computers, Games, Health, Home, News, Recreation, Reference, Science, Shopping, Society, Sports, Adult

**Installation:**
```bash
pip install homepage2vec
```

**Pros:**
- ✅ Pre-trained, works out of box
- ✅ 92 languages supported
- ✅ Academic paper backed

**Cons:**
- ❌ Categories may not match your needs exactly
- ❌ Requires Python (can run as microservice)
- ❌ Heavy model (~500MB)

### ⚡ Lightweight Traditional ML Models

For Layer 3 of your hybrid system, train a lightweight classifier yourself.

#### URL Classification (TF-IDF + Naive Bayes)
- GitHub: https://github.com/sarkar-sayan/url-classification
- Simple approach: classify URLs as productive/non-productive
- Technologies: Python, Scikit-learn, TF-IDF, Naive Bayes

#### Website Classification (CNN + SGD)
- GitHub: https://github.com/Shaurov05/Website-Classification
- More advanced: uses CNN on n-grams from URLs
- Trained on DMOZ dataset (1.5M URLs, 15 categories)

### 🧠 Small Language Models (Local Deployment)

Fine-tuned BERT-style models outperform zero-shot LLMs for classification with moderate training data.

#### DistilBERT (Recommended)
- HuggingFace: https://huggingface.co/distilbert-base-uncased
- 6x faster than BERT, 60% smaller, retains 97% performance
- Great for fine-tuning on your labeled data
- 66M parameters, fast inference

**Fine-tuning Guide:**
https://huggingface.co/docs/transformers/training

---

## 📊 Datasets

### 🌟 Curlie Dataset (Best for Website Classification)

2+ million category-labeled websites from the largest human-edited web directory. This is what Homepage2Vec was trained on.

**Link:** https://figshare.com/articles/dataset/Curlie_Dataset_-_Language-agnostic_Website_Embedding_and_Classification/19406693

**Features:**
- 2M+ URLs
- 14 Categories
- 92 Languages
- Free to use

### Kaggle Datasets

#### Website Classification Using URL
- Link: https://www.kaggle.com/datasets/shaurov/website-classification-using-url
- 1.5M URLs with 15 categories from DMOZ/Open Directory Project
- Good for URL-only classification

#### Website Classification Dataset
- Link: https://www.kaggle.com/datasets/hetulmehta/website-classification
- Additional website classification dataset on Kaggle

### Specialized Datasets

#### UK Web Archive Classification
- Link: https://data.webarchive.org.uk/opendata/ukwa.ds.1/classification/
- Manually curated UK websites with two-tiered subject hierarchy
- Good for educational/reference sites

#### URL Categorization (CrowdFlower)
- Link: https://data.world/crowdflower/url-categorization
- Crowdsourced URL categories

### 🔧 Creating Your Own Dataset

For best results, create a custom dataset specific to university students:

**Step 1:** Collect 500-1000 URLs from your pilot users

**Step 2:** Label them as academic/non-academic/neutral manually

**Step 3:** Include context: course-related sites, university LMS, etc.

**Step 4:** Use this to fine-tune DistilBERT or train TF-IDF classifier

> 💡 **Tip:** Even 500 labeled examples can significantly boost accuracy for your specific use case.

---

## 🧠 AI/LLM Approach

### 🎯 Your Intuition is Correct

"Using AI only is not effective sometimes" – **Absolutely right!**

LLMs excel at understanding context and nuance, but they're overkill for obvious cases. Why call an LLM to classify "facebook.com" when a simple database lookup works instantly?

**Use AI as your "smart fallback"** – only for the 10-15% of cases where simpler methods are uncertain.

### Option A: Cloud LLM API (OpenAI, Anthropic)

**Pros:**
- ✅ Most accurate (GPT-4, Claude are very smart)
- ✅ No local compute needed
- ✅ Always up-to-date models
- ✅ Zero-shot works surprisingly well

**Cons:**
- ❌ Costs money per request (~$0.01-0.03 per classification)
- ❌ Latency: 500ms-2s per request
- ❌ Privacy: sending user data to third party
- ❌ Rate limits
- ❌ Requires internet connection

**Verdict:** Good for initial prototyping, but not recommended for production due to cost and privacy concerns.

### Option B: Local LLM with Ollama (Recommended for Layer 4)

Run open-source LLMs locally on the student's machine. Ollama makes this easy and integrates perfectly with your Electron.js desktop app via Node.js.

**Resources:**
- Ollama: https://ollama.com/
- ollama-js (NPM): https://github.com/ollama/ollama-js

**Installation:**
```bash
# Install Ollama (one-time setup)
# Download from https://ollama.com/

# Install JavaScript library
npm install ollama
```

#### Recommended Models:

| Model | Size | Speed | Best For |
|-------|------|-------|----------|
| Llama 3.2 (3B) | 2GB | Fast | Best balance for classification |
| Phi-3 Mini (3.8B) | 2.3GB | Fast | Microsoft, good for tasks |
| Mistral (7B) | 4.1GB | Medium | More capable, needs GPU |
| TinyLlama (1.1B) | 600MB | Fastest | Ultra-lightweight, less accurate |

**Pros:**
- ✅ Free - no API costs
- ✅ Privacy - data never leaves device
- ✅ Works offline
- ✅ Fast enough for occasional use (~500ms)
- ✅ Easy Node.js integration

**Cons:**
- ❌ Requires 2-4GB disk space
- ❌ Uses RAM when running
- ❌ Student needs to install Ollama
- ❌ Less accurate than GPT-4

#### Sample Ollama Classification Code

```javascript
// In your Electron.js main process
const ollama = require('ollama');

async function classifyWithLLM(url, title, userCourses) {
  const prompt = `You are classifying web activity for a university student.
  
Student's courses: ${userCourses.join(', ')}
URL: ${url}
Page Title: ${title}

Is this ACADEMIC (related to their studies), NON_ACADEMIC (entertainment/distraction), 
or NEUTRAL (productivity tools, communication)?

Reply with ONLY one word: ACADEMIC, NON_ACADEMIC, or NEUTRAL`;

  const response = await ollama.chat({
    model: 'llama3.2',
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0.1 }  // Low temp for consistent classification
  });
  
  const answer = response.message.content.trim().toUpperCase();
  return ['ACADEMIC', 'NON_ACADEMIC', 'NEUTRAL'].includes(answer) 
    ? answer 
    : 'NEUTRAL';
}
```

### Option C: Embedded Small Model (Advanced)

For maximum speed and privacy, fine-tune a small transformer model (DistilBERT) and embed it directly in your Electron app using ONNX Runtime.

**Resource:**
- Transformers.js: https://huggingface.co/docs/transformers.js

**Pros:**
- ✅ Fastest inference (~20ms)
- ✅ No external dependencies
- ✅ Fully offline

**Cons:**
- ❌ Requires training your own model
- ❌ Complex setup
- ❌ Less flexible than LLM

---

## ✅ Implementation Recommendation

### 🏆 Recommended Architecture

**Layer 1: Domain Rules Database (JSON file)**
- Start with 200-300 common domains
- Instant lookup
- Handles ~40% of traffic

**Layer 2: URL Path Analyzer (Custom logic)**
- Handle YouTube, Google, social media
- Analyze path + title keywords

**Layer 3: Lightweight ML (TF-IDF + SVM or Fine-tuned DistilBERT)**
- Train on Curlie dataset + your labeled samples
- Fast local inference

**Layer 4: Local LLM via Ollama (Llama 3.2 3B)**
- Only for uncertain cases (~10%)
- Context-aware classification with student's courses

**Layer 5: User Feedback System**
- Let users correct mistakes
- Improves all layers over time

### 📋 Implementation Priority

#### Phase 1 (MVP):
- ✓ Domain rules database (JSON) + URL path analyzer
- ✓ User feedback UI for corrections

#### Phase 2 (Enhancement):
- ✓ Train lightweight ML model on collected + Curlie data
- ✓ Integrate as Layer 3

#### Phase 3 (Advanced):
- ✓ Ollama integration for complex cases
- ✓ Context-aware classification (student's courses, time of day)

### 🔗 Key Resources Summary

| Resource | Link |
|----------|------|
| Pre-trained Model | [Homepage2Vec](https://github.com/epfl-dlab/homepage2vec) |
| Dataset | [Curlie (2M+ URLs)](https://figshare.com/articles/dataset/Curlie_Dataset_-_Language-agnostic_Website_Embedding_and_Classification/19406693) |
| URL Dataset | [Kaggle (1.5M URLs)](https://www.kaggle.com/datasets/shaurov/website-classification-using-url) |
| Local LLM | [Ollama](https://ollama.com/) + [ollama-js](https://github.com/ollama/ollama-js) |
| Lightweight Transformer | [DistilBERT](https://huggingface.co/distilbert-base-uncased) |

---

## 🚀 Getting Started

1. **Start Simple**: Implement Layer 1 (domain rules) and Layer 2 (URL path analysis) first
2. **Collect Data**: Gather real usage data from pilot users
3. **Label & Train**: Create your custom dataset and train Layer 3 model
4. **Add Intelligence**: Integrate Ollama for Layer 4 when you need context-aware classification
5. **Iterate**: Use user feedback to continuously improve all layers

---

## 📝 Notes for Claude Code

This document is designed to be used with Claude Code for implementation. Key areas where Claude Code can help:

- Implementing the cascading classification logic
- Building the domain rules database and lookup system
- Creating the URL path analyzer for ambiguous domains
- Training and integrating the lightweight ML model
- Setting up Ollama integration in Electron.js
- Building the user feedback UI and data collection system

Feel free to ask Claude Code to implement specific components from this architecture!
