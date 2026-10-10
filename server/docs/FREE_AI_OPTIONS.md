# Free AI Options for Orchestrator

When Groq's daily limit (100k tokens) is reached, or you want unlimited usage, use one of these options:

---

## 1. Ollama (Recommended – Unlimited, Local)

**No API key. No rate limits. Completely free.**

### Setup

1. **Install Ollama**: https://ollama.com/download
2. **Pull a model** (in terminal):
   ```bash
   ollama run llama3.2
   ```
   Or for smaller/faster: `ollama run llama3.2:1b`
3. **In server/.env**:
   ```
   USE_OLLAMA=true
   ```
4. Restart the backend.

Ollama runs models on your machine. No cloud, no tokens, no limits.

---

## 2. Rule-Based Fallback (No AI, No Tokens)

When no API key and no Ollama, the orchestrator uses **rule-based** answers for:

- "How many students?" → Student count from DB
- "List students" → Student list
- "List teachers" → Teacher list
- "List classes" → Class list
- "Who needs attention?" → Attention report
- "Add student X in class 5" → Adds via DB (simple parsing)

Works even when Groq limit is hit – try these exact phrases.

---

## 3. Groq (Cloud, 100k tokens/day)

- **Limit**: ~100,000 tokens/day (resets midnight UTC)
- **Setup**: `GROQ_API_KEY=your_key` in .env
- **Get key**: https://console.groq.com/

---

## 4. Google Gemini (Free Tier)

- **Limit**: 15 RPM, 1M TPM (free tier)
- **Setup**: Install `@langchain/google-genai`, set `GOOGLE_API_KEY`
- **Get key**: https://aistudio.google.com/apikey

---

## 5. Together AI (Free Tier)

- **Limit**: Varies by model
- **Setup**: `TOGETHER_API_KEY`, model `together:...`
- **Get key**: https://api.together.xyz/

---

## Summary

| Option      | Cost   | Limits        | Setup                    |
|------------|--------|---------------|--------------------------|
| **Ollama** | Free   | None          | Install + USE_OLLAMA=true|
| **Rule-based** | Free | None      | No config (fallback)     |
| **Groq**   | Free   | 100k tokens/day | API key               |
| **Gemini** | Free   | 15 RPM        | API key                  |

**Best for unlimited use**: Ollama.
