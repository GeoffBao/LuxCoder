# 编辑演示文稿

## 基于模板的工作流

使用现有演示文稿作为模板时：

1. **分析现有幻灯片**：
   ```bash
   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
   ```
   查看 `thumbnails.jpg` 了解版式，查看 markitdown 输出了解占位文字。

2. **规划幻灯片映射**：为每个内容板块选择合适的模板幻灯片。

   ⚠️ **使用多样化的版式**——单调的演示文稿是常见的失败模式。不要默认使用基本的标题 + 项目符号幻灯片。主动寻找：
   - 多栏版式（两栏、三栏）
   - 图片 + 文字组合
   - 全出血图片 + 文字叠加
   - 引言或标注型幻灯片
   - 章节分隔页
   - 数据/数字标注
   - 图标网格或图标 + 文字行

   **避免：** 每张幻灯片都重复相同的文字密集型版式。

   将内容类型与版式风格相匹配（例如：关键要点 → 项目符号页，团队信息 → 多栏版式，用户证言 → 引言页）。

3. **解包**：`python scripts/office/unpack.py template.pptx unpacked/`

4. **构建演示文稿**（自己完成，不要交给子 Agent）：
   - 删除不需要的幻灯片（从 `<p:sldIdLst>` 中移除）
   - 复制要复用的幻灯片（`add_slide.py`）
   - 调整 `<p:sldIdLst>` 中幻灯片的顺序
   - **在步骤 5 之前完成所有结构性修改**

5. **编辑内容**：更新每张 `slide{N}.xml` 中的文字。
   **如果可用，在此使用子 Agent**——每张幻灯片是独立的 XML 文件，子 Agent 可以并行编辑。

6. **清理**：`python scripts/clean.py unpacked/`

7. **打包**：`python scripts/office/pack.py unpacked/ output.pptx --original template.pptx`

---

## 脚本

| Script | Purpose |
|--------|---------|
| `unpack.py` | Extract and pretty-print PPTX |
| `add_slide.py` | Duplicate slide or create from layout |
| `clean.py` | Remove orphaned files |
| `pack.py` | Repack with validation |
| `thumbnail.py` | Create visual grid of slides |

### unpack.py

```bash
python scripts/office/unpack.py input.pptx unpacked/
```

提取 PPTX，美化 XML 格式，转义智能引号。

### add_slide.py

```bash
python scripts/add_slide.py unpacked/ slide2.xml      # Duplicate slide
python scripts/add_slide.py unpacked/ slideLayout2.xml # From layout
```

打印 `<p:sldId>`，用于在 `<p:sldIdLst>` 的指定位置添加。

### clean.py

```bash
python scripts/clean.py unpacked/
```

移除不在 `<p:sldIdLst>` 中的幻灯片、未引用的媒体和孤立的关系文件（rels）。

### pack.py

```bash
python scripts/office/pack.py unpacked/ output.pptx --original input.pptx
```

验证、修复、压缩 XML，重新编码智能引号。

### thumbnail.py

```bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
```

创建以幻灯片文件名为标签的 `thumbnails.jpg`。默认 3 列，每张网格最多 12 张。

**仅用于模板分析**（选择版式）。如需视觉质检（QA），请使用 `soffice` + `pdftoppm` 生成全分辨率单张幻灯片图片——参见 SKILL.md。

---

## 幻灯片操作

幻灯片顺序位于 `ppt/presentation.xml` → `<p:sldIdLst>` 中。

**调整顺序**：重新排列 `<p:sldId>` 元素。

**删除**：移除 `<p:sldId>`，然后运行 `clean.py`。

**添加**：使用 `add_slide.py`。切勿手动复制幻灯片文件——脚本会处理手动复制容易遗漏的备注引用、Content_Types.xml 和关系 ID。

---

## 编辑内容

**子 Agent：** 如果可用，在此使用它们（完成步骤 4 之后）。每张幻灯片是独立的 XML 文件，子 Agent 可以并行编辑。在给子 Agent 的提示词中，需要包含：
- 要编辑的幻灯片文件路径
- **"Use the Edit tool for all changes"**
- 下面的格式规则和常见陷阱

对每张幻灯片：
1. 读取幻灯片的 XML
2. 找出所有占位内容——文字、图片、图表、图标、标题说明
3. 用最终内容替换每个占位内容

**使用 Edit 工具，而不是 sed 或 Python 脚本。** Edit 工具强制明确要替换什么、在哪里替换，可靠性更高。

### 格式规则

- **将标题、副标题和行内标签全部加粗**：在 `<a:rPr>` 上使用 `b="1"`。包括：
  - 幻灯片标题
  - 幻灯片内的章节标题
  - 行首的行内标签（例如："Status:"、"Description:"）
- **切勿使用 unicode 项目符号（•）**：使用 `<a:buChar>` 或 `<a:buAutoNum>` 进行正确的列表格式化
- **项目符号一致性**：让项目符号从版式继承。只指定 `<a:buChar>` 或 `<a:buNone>`。

---

## 常见陷阱

### 模板适配

当源内容比模板项少时：
- **彻底移除多余的元素**（图片、形状、文本框），不要只清空文字
- 清空文字内容后检查是否留下孤立视觉元素
- 运行视觉质检以发现数量不匹配

当用不同长度的内容替换文字时：
- **较短的替换**：通常安全
- **较长的替换**：可能溢出或意外换行
- 文字修改后用视觉质检测试
- 考虑截断或拆分内容以适配模板的设计约束

**模板槽位 ≠ 源项目**：如果模板有 4 位团队成员但源只有 3 位，删除第 4 位成员的整个组（图片 + 文本框），而不只是文字。

### 多项目内容

如果源有多个项目（编号列表、多个章节），为每个项目创建独立的 `<a:p>` 元素——**切勿拼接成一个字符串**。

**❌ 错误** ——所有项目放在一个段落中：
```xml
<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
```

**✅ 正确** ——使用加粗标题的独立段落：
```xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 2</a:t></a:r>
</a:p>
<!-- continue pattern -->
```

从原段落复制 `<a:pPr>` 以保留行距。在标题上使用 `b="1"`。

### 智能引号

由 unpack/pack 自动处理。但 Edit 工具会将智能引号转换为 ASCII。

**添加带引号的新文本时，使用 XML 实体：**

```xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
```

| Character | Name | Unicode | XML Entity |
|-----------|------|---------|------------|
| `“` | Left double quote | U+201C | `&#x201C;` |
| `”` | Right double quote | U+201D | `&#x201D;` |
| `‘` | Left single quote | U+2018 | `&#x2018;` |
| `’` | Right single quote | U+2019 | `&#x2019;` |

### 其他

- **空白**：对于带前导/尾随空格的 `<a:t>`，使用 `xml:space="preserve"`
- **XML 解析**：使用 `defusedxml.minidom`，不要用 `xml.etree.ElementTree`（会破坏命名空间）
