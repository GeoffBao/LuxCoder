---
name: beautiful-html-templates
description: HTML 幻灯片模板库（34 个预置视觉模板）。按用户给的场合与情绪（occasion & mood），通过 index.json 匹配模板，克隆并在模板设计体系内替换/扩展内容，产出精美 HTML 演示。当用户想要"漂亮的 HTML 演示/网页 PPT"、需要模板选型、或提到 beautiful-html-templates 时使用。完整操作手册见同目录 AGENTS.md。
group: 演示文稿
version: 1.0.0
---

# Beautiful HTML Templates

一个可复用的 HTML 幻灯片模板库，供任何 coding agent 替用户挑选合适模板并产出精美的 HTML 演示。

## 使用方式

1. 完整读取本目录下的 [`AGENTS.md`](./AGENTS.md)——它是操作手册：如何读 `index.json`、把用户需求匹配到模板、克隆模板并替换内容。
2. 读取 [`index.json`](./index.json)：34 个模板的元数据索引（slug / mood / tone / occasion / formality 等）。
3. 按 AGENTS.md 的六步工作流执行：先问场合与情绪 → 挑 3 个候选 → 生成标题页预览 → 打开预览让用户选择 → 在所选模板的设计体系内构建完整 deck → 打开最终文件并回传路径。

## 关键原则

- **不跳过澄清与预览步骤**：即使用户需求看起来明确，也要先问 occasion 和 mood。
- **候选要差异足够大**：三个候选应来自不同视觉体系，给用户真实选择。
- **缺布局时在模板内设计**：使用同一字体、色板、装饰词汇和间距节奏，不要引入新视觉语言。
- **每个产物都要在浏览器打开并回传路径**：预览、中间迭代、最终 deck 都如此。

## 相关

- 本库的 `templates/` 是全部模板源码；`screenshots/` 是每个模板的三张预览图（可在 README 画廊浏览）。
- 与 frontend-slides Skill 配套：frontend-slides 内置的 bold-template-pack 与本库模板同源。
