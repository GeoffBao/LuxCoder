---
name: pdf
description: "只要用户提到 PDF 文件，或要求生成/编辑 PDF，就使用本 Skill。对于只读任务（阅读、总结、提取纯文本、或回答 PDF 相关问题），遵循本 Skill 的只读路由规则：优先使用内置 Read 工具，不要编写代码或脚本；超过 100 页的 PDF 优先使用 markitdown。仅在需要修改的场景（合并、拆分、旋转、水印、表单填写、加密/解密、图片提取、OCR、创建 PDF）才使用 PDF 处理库/脚本。"
license: Proprietary. LICENSE.txt has complete terms
version: "1.0.6"
---

# PDF 处理指南

## 概述

本指南定义了如何处理 PDF 文件。只读任务必须优先使用内置工具处理。Python 库和脚本是用于 PDF 修改、OCR、表单填写或其他无法通过直接读取完成的操作时的回退工具。

## 只读路由规则

本节适用于"读取这个 PDF"、"总结这个 PDF"、"回答这个 PDF 的问题"或"提取主要内容"等请求。

1. 优先对 PDF 路径使用内置 Read 工具。
   - 简单读取时，不要编写 Python、JavaScript、shell 脚本或临时提取文件。
   - 除非内置 Read 工具失败，或用户明确要求生成文件，否则不要将下面的 Python 示例用于只读任务。

2. 如果 PDF 超过 100 页，优先使用 markitdown 而不是 Python 库。
   - 首先检查全局 `markitdown` 命令是否可用。
   - 如果全局 `markitdown` 存在，直接使用它。
   - 如果全局 `markitdown` 缺失，先为用户全局安装，然后再使用。
   - 不要围绕 markitdown 创建包装脚本。
   - 如果因网络、权限或缺少 Python 工具链导致安装失败，简要说明情况，然后回退到内置 Read 工具，或询问要检查的页码范围。

3. 仅当任务需要文档转换、复杂表格提取、OCR、表单填写、图片提取或 PDF 生成时，才转向 PDF 处理库或脚本。

### 页数检查

使用成本最低的可用命令。先尝试 `pdfinfo`：

```bash
pdfinfo input.pdf | grep '^Pages:'
```

如果 `pdfinfo` 不可用，使用内置 Read 工具，并根据工具结果推断文档是否较长。避免仅为了决定读取路径而编写自定义页数统计脚本。

### 长 PDF 使用 markitdown

对于超过 100 页的 PDF，首先检查是否有全局可用的 markitdown 命令：

```bash
command -v markitdown
```

如果存在，直接转换为 Markdown：

```bash
markitdown input.pdf
```

如果 `markitdown` 未安装，请在转换前全局安装。优先使用 `pip` 直接安装，因为它通常比基于 Homebrew 的流程更快，且网络/工具链依赖更少。

安装前，如果工具可用，快速验证包来源/版本：

```bash
python3 -m pip index versions markitdown
```

然后安装：

```bash
python3 -m pip install --user "markitdown[all]"
```

安装后，运行 `markitdown input.pdf`。如果命令不在 PATH 中，尝试 `python3 -m markitdown input.pdf`，或使用用户的 Python user-base bin 路径。

如果输出对响应来说太长，请检查或总结相关部分，而不是倾倒全文。当保存转换后的 Markdown 文件有用时，仅在用户尚未请求文件输出的情况下询问。

## 修改与高级处理

当用户要求修改 PDF、创建 PDF、填写表单、提取图片、OCR 扫描页面，或执行内置 Read 工具无法处理的精确表格提取时，使用以下各节。

## Python 库

### pypdf - 基本操作

#### 合并 PDF
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### 拆分 PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### 提取元数据
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

#### 旋转页面
```python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber - 文本与表格提取

#### 保留布局提取文本
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

#### 提取表格
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

#### 高级表格提取
```python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab - 创建 PDF

#### 基本 PDF 创建
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
```

#### 创建多页 PDF
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
```

#### 下标与上标

**重要**：切勿在 ReportLab PDF 中使用 Unicode 下标/上标字符（₀₁₂₃₄₅₆₇₈₉、⁰¹²³⁴⁵⁶⁷⁸⁹）。内置字体不包含这些字形，会导致它们渲染为实心黑框。

相反，请在 Paragraph 对象中使用 ReportLab 的 XML 标记标签：
```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
```

对于 canvas 绘制的文本（非 Paragraph 对象），请手动调整字体大小和位置，而不是使用 Unicode 下标/上标。

## 命令行工具

### pdftotext (poppler-utils)
```bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```

### qpdf
```bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
```

### pdftk（如可用）
```bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
```

## 常见任务

### 从扫描 PDF 提取文本
```python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n"
    text += pytesseract.image_to_string(image)
    text += "\n\n"

print(text)
```

### 添加水印
```python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### 提取图片
```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

### 密码保护
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## 快速参考

| 任务 | 最佳工具 | 命令/代码 |
|------|-----------|--------------|
| 合并 PDF | pypdf | `writer.add_page(page)` |
| 拆分 PDF | pypdf | 每页一个文件 |
| 读取或总结 PDF | 内置 Read 工具 | 先用 Read；不写脚本 |
| 长 PDF 文本提取（>100 页） | markitdown | `markitdown input.pdf` |
| Read 失败后提取文本 | pdfplumber | `page.extract_text()` |
| Read 失败后提取表格 | pdfplumber | `page.extract_tables()` |
| 创建 PDF | reportlab | Canvas 或 Platypus |
| 命令行合并 | qpdf | `qpdf --empty --pages ...` |
| OCR 扫描 PDF | pytesseract | 先转换为图片 |
| 填写 PDF 表单 | pdf-lib 或 pypdf（见 FORMS.md） | 见 FORMS.md |

## 后续步骤

- 高级 pypdfium2 用法，见 REFERENCE.md
- JavaScript 库（pdf-lib），见 REFERENCE.md
- 如需填写 PDF 表单，请按照 FORMS.md 中的说明操作
- 故障排查指南，见 REFERENCE.md
