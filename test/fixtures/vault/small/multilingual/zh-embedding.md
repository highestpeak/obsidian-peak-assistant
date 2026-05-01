---
tags: [embeddings, 中文]
---
# 为什么 embedding 是例外

Anthropic 没有 embedding endpoint，所以 embedding 单独走一条 HTTP 路径，
典型是 OpenAI-format 的 /v1/embeddings，通过 OpenRouter 或 LiteLLM 代理。
这不是第二条 runtime，是一个纯数据工具函数。
