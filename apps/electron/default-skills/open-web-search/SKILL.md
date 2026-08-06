---
name: open-web-search
description: "开放网络搜索 - 使用 DuckDuckGo、SearxNG 等免费搜索引擎和 Wikipedia、GitHub 等开放数据源，进行实时网络搜索，获取最新信息、学术文献、开源项目、技术文档等。无需 API Key，完全免费。触发词：搜索、search、查找、最新信息、实时搜索、网络搜索"
group: 网络搜索
version: 1.0.0
---

# 开放网络搜索

## 概述

本技能使用 **DuckDuckGo**（免费，无需 API Key）、**SearxNG**（开源，自托管或公共实例）等免费搜索引擎，以及 **Wikipedia**、**GitHub**、**arXiv** 等开放数据源，进行实时网络搜索。支持获取最新信息、学术文献、开源项目、技术文档等，无需任何付费订阅。

**完全免费** - 无需 API Key，无需订阅！

## 数据源

| 数据源 | 费用 | 特点 | 适用场景 |
|--------|------|------|----------|
| **DuckDuckGo** | **免费** | 无需API Key，隐私友好 | 通用网页搜索 |
| **Wikipedia API** | **免费** | 知识性强，结构化 | 概念解释、背景知识 |
| **GitHub API** | **免费** (5000 req/h) | 开源项目、代码 | 技术实现参考 |
| **arXiv API** | **免费** | 最新预印本论文 | 学术研究 |
| **CrossRef API** | **免费** | 论文元数据 | 文献引用信息 |
| **SearxNG** | **免费** | 聚合多个引擎 | 深度搜索 |

## 前置条件

**无需任何配置！** 直接使用。

可选增强：
- 如需更高 GitHub API 限制，可配置 `GITHUB_TOKEN`
- 如需自建 SearxNG，可参考 https://docs.searxng.org/

## 功能特性

| 功能 | 说明 |
|------|------|
| **实时网页搜索** | 获取最新网页内容 |
| **学术文献搜索** | arXiv、CrossRef 论文检索 |
| **开源项目搜索** | GitHub 仓库和代码 |
| **知识查询** | Wikipedia 概念解释 |
| **多源聚合** | 单一查询多源结果 |
| **结果过滤** | 按时间、来源、类型过滤 |

## 使用方法

### 在对话中使用

直接描述你的搜索需求：

```
搜索2026年最新的AI发展趋势
```

```
查找关于Transformer架构的最新论文
```

```
搜索GitHub上关于联邦学习的开源项目
```

```
查找量子计算在药物发现中的应用
```

```
搜索什么是RetNet架构
```

### 支持的查询类型

- **时事新闻**：最新技术动态、产品发布
- **学术论文**：arXiv最新论文、研究方向
- **开源项目**：GitHub代码实现、工具库
- **技术文档**：官方文档、API参考
- **背景知识**：概念解释、百科查询

## 工作流程

### 方法一：命令行脚本

```bash
# 通用网页搜索
python scripts/search_duckduckgo.py "federated learning latest trends 2025"

# 学术论文搜索
python scripts/search_arxiv.py "multimodal large language model"

# GitHub项目搜索
python scripts/search_github.py "federated learning pytorch"

# Wikipedia查询
python scripts/search_wikipedia.py "Transformer architecture"

# 多源聚合搜索
python scripts/multi_search.py "quantum machine learning"
```

### 方法二：Python 函数调用

```python
from scripts.search import DuckDuckGoSearch, ArxivSearch

# DuckDuckGo 搜索
ddg = DuckDuckGoSearch()
results = ddg.search("latest AI news 2025", max_results=10)

# arXiv 搜索
arxiv = ArxivSearch()
papers = arxiv.search("federated learning", max_results=20)
```

## 输出示例

### 网页搜索结果

```markdown
# 搜索: "federated learning healthcare 2025"

## DuckDuckGo 搜索结果 (10条)

### 1. Federated Learning for Healthcare: A Practical Introduction
- **来源**: Medium / NVIDIA Blog
- **日期**: 2025-01-15
- **摘要**: 介绍联邦学习在医疗领域的最新应用实践，包括多医院协作案例...
- **链接**: https://medium.com/...

### 2. Advances in Privacy-Preserving Medical AI
- **来源**: Nature Medicine
- **日期**: 2025-02-03
- **摘要**: 最新研究提出新的联邦学习方法，在保证隐私的同时提升诊断准确率...
- **链接**: https://www.nature.com/...

### 3. [GitHub] federated-learning-medical
- **来源**: GitHub
- **星标**: ⭐ 1,234
- **描述**: 开源联邦学习医疗应用框架，支持多种联邦算法...
- **链接**: https://github.com/...

...
```

### 学术论文搜索结果

```markdown
# arXiv 搜索: "multimodal large language model"

## 最新论文 (20篇)

### 1. MM-LLaVA: A Multimodal Large Language Model for Visual Understanding
- **作者**: Zhang et al.
- **发布时间**: 2025-03-10
- **arXiv ID**: 2503.04567
- **摘要**: We propose MM-LLaVA, a novel multimodal large language model that...
- **PDF**: https://arxiv.org/pdf/2503.04567.pdf
- **代码**: https://github.com/...

### 2. Federated Multimodal Learning for Healthcare Applications  
- **作者**: Li et al.
- **发布时间**: 2025-03-05
- **arXiv ID**: 2503.01234
- **分类**: cs.LG, cs.AI
- **摘要**: This paper explores the integration of federated learning with multimodal...

...
```

### GitHub 项目搜索结果

```markdown
# GitHub 搜索: "federated learning"

## 热门项目 (10个)

### 1. FedML-AI/FedML
- ⭐ 8,234 stars | 🍴 1,567 forks
- **描述**: A research library and benchmark for federated machine learning
- **语言**: Python (98%)
- **最近更新**: 3天前
- **链接**: https://github.com/FedML-AI/FedML

### 2. adap/flower
- ⭐ 5,678 stars | 🍴 892 forks  
- **描述**: Flower - A Friendly Federated Learning Framework
- **语言**: Python (95%)
- **最近更新**: 1周前
- **链接**: https://github.com/adap/flower

...
```

### Wikipedia 查询结果

```markdown
# 查询: "Transformer (machine learning model)"

## Transformer

**Transformer**是一种采用自注意力机制的深度学习模型，最初由Google在2017年论文
"Attention Is All You Need"中提出。

### 核心概念
- **自注意力机制 (Self-Attention)**: 允许模型在编码一个位置时关注输入序列的所有位置
- **多头注意力 (Multi-Head Attention)**: 并行执行多个注意力函数
- **位置编码 (Positional Encoding)**: 为序列添加位置信息

### 应用
- **自然语言处理**: GPT、BERT、T5等模型
- **计算机视觉**: Vision Transformer (ViT)
- **多模态学习**: CLIP、DALL-E

### 历史
- **2017**: Vaswani et al. 提出 Transformer
- **2018**: BERT 和 GPT-1 发布
- **2020**: GPT-3 展示大规模预训练能力
- **2022**: ChatGPT 引发全球关注

**来源**: Wikipedia (CC BY-SA)
```

## 高级用法

### 多源聚合搜索

```bash
# 同时使用多个数据源
python scripts/multi_search.py "diffusion model image generation" \
  --sources ddg,arxiv,github \
  --max-results 30 \
  --output results.json
```

### 时间过滤

```bash
# 仅搜索最近一年的内容
python scripts/search_duckduckgo.py "AI news" --time year

# 仅搜索最近一月的内容  
python scripts/search_arxiv.py "LLM" --time month
```

### 结果导出

```bash
# 导出为 Markdown 报告
python scripts/export_report.py --input results.json --format markdown

# 导出为 CSV
python scripts/export_report.py --input results.json --format csv
```

## 与 Perplexity 的对比

| 特性 | Perplexity (付费) | Open Web Search (免费) |
|------|-------------------|------------------------|
| **费用** | 需要 OpenRouter API Key ($5+) | **完全免费** |
| **AI 总结** | ✅ 自动生成 | ❌ 需自行分析 |
| **来源引用** | ✅ 自动提取 | ✅ 保留来源链接 |
| **实时性** | ✅ 实时搜索 | ✅ 实时搜索 |
| **数据源** | Perplexity 自有 | DuckDuckGo + 多源 |
| **隐私** | 依赖第三方 | ✅ 更隐私友好 |

### 使用建议

- **快速事实查询** → Open Web Search
- **深度研究分析** → Open Web Search + 人工整理  
- **需要 AI 总结** → 结合 GPT 分析搜索结果

## 技术说明

### API 限制

| 数据源 | 限制 | 应对策略 |
|--------|------|----------|
| DuckDuckGo | 无明确限制 | 添加请求间隔 |
| GitHub API | 5000 req/h | 使用 token 提升限制 |
| arXiv API | 无明确限制 | 合理使用 |
| Wikipedia | 无明确限制 | 遵循 robots.txt |

### 搜索优化技巧

1. **关键词优化**
   - 使用英文关键词获得更好结果
   - 添加时间限定词（2024, 2025, latest）

2. **组合搜索**
   - 技术 + 应用："federated learning healthcare"
   - 问题 + 方法："privacy protection differential privacy"

3. **结果筛选**
   - 优先查看 .edu, .ac.uk 等学术域名
   - GitHub 项目看 stars 数和更新频率

## 相关技能

- [skill:open-research-trend] - 研究趋势分析
- [skill:open-topic-analysis] - 选题分析  
- [skill:open-research-gap] - 研究空白发现

## 更新日志

**v1.0.0** (2025-03-22)
- 初始版本
- 支持 DuckDuckGo、arXiv、GitHub、Wikipedia 多源搜索
- 完全免费，无需 API Key
- 提供命令行和 Python API 两种使用方式