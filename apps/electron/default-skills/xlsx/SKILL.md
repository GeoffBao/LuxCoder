---
name: xlsx
description: "只要电子表格文件是主要输入或输出，就使用本技能。这意味着任何用户想要：打开、读取、编辑或修复已有的 .xlsx、.xlsm、.csv 或 .tsv 文件（例如添加列、计算公式、格式化、绘制图表、清理脏数据）；从零开始或从其他数据源创建新电子表格；或在表格文件格式之间转换的任务。当用户按名称或路径提到电子表格文件时尤其要触发——即使只是随口一提（比如“我下载里的那个 xlsx”）——并希望对它做些什么或从中产出什么。也适用于把混乱的表格数据文件（格式错误的行、错位的表头、垃圾数据）清理重组为规范的电子表格。交付物必须是电子表格文件。当主要交付物是 Word 文档、HTML 报告、独立 Python 脚本、数据库管道或 Google Sheets API 集成时，即使涉及表格数据，也不要触发。"
license: Proprietary. LICENSE.txt has complete terms
version: "1.0.2"
---

# 输出要求

## 所有 Excel 文件

### 专业字体
- 除非用户另有指示，所有交付物使用一致、专业的字体（例如 Arial、Times New Roman）

### 零公式错误
- 每个 Excel 模型必须以零公式错误交付（#REF!、#DIV/0!、#VALUE!、#N/A、#NAME?）

### 保留现有模板（更新模板时）
- 修改文件时，研究并精确匹配现有的格式、样式和约定
- 绝不对已有既定模式的文件强加标准化格式
- 现有模板的约定始终优先于这些指南

## 财务模型

### 颜色编码标准
除非用户或现有模板另有说明

#### 行业标准颜色约定
- **蓝色文本（RGB: 0,0,255）**：硬编码输入，以及用户将针对场景更改的数字
- **黑色文本（RGB: 0,0,0）**：所有公式和计算
- **绿色文本（RGB: 0,128,0）**：从同一工作簿内其他工作表拉取的链接
- **红色文本（RGB: 255,0,0）**：指向其他文件的外部链接
- **黄色背景（RGB: 255,255,0）**：需要关注的关键假设或需要更新的单元格

### 数字格式标准

#### 必需格式规则
- **年份**：格式化为文本字符串（例如 "2024" 而不是 "2,024"）
- **货币**：使用 $#,##0 格式；始终在表头中指明单位（"Revenue ($mm)"）
- **零值**：使用数字格式把所有零显示为 "-"，包括百分比（例如 "$#,##0;($#,##0);-"）
- **百分比**：默认为 0.0% 格式（一位小数）
- **倍数**：估值倍数（EV/EBITDA、P/E）格式化为 0.0x
- **负数**：使用括号 (123) 而不是负号 -123

### 公式构造规则

#### 假设的放置
- 把所有假设（增长率、利润率、倍数等）放在单独的假设单元格中
- 公式中使用单元格引用，而不是硬编码值
- 示例：使用 =B5*(1+$B$6) 而不是 =B5*1.05

#### 公式错误预防
- 验证所有单元格引用是否正确
- 检查区域中的 off-by-one 错误
- 确保所有预测期公式一致
- 用边缘情况测试（零值、负数）
- 验证没有意外的循环引用

#### 硬编码值的文档要求
- 在单元格中或旁边加批注（如果在表格末尾）。格式："Source: [System/Document], [Date], [Specific Reference], [URL if applicable]"
- 示例：
  - "Source: Company 10-K, FY2024, Page 45, Revenue Note, [SEC EDGAR URL]"
  - "Source: Company 10-Q, Q2 2025, Exhibit 99.1, [SEC EDGAR URL]"
  - "Source: Bloomberg Terminal, 8/15/2025, AAPL US Equity"
  - "Source: FactSet, 8/20/2025, Consensus Estimates Screen"

# XLSX 创建、编辑与分析

## 概述

用户可能会要求你创建、编辑或分析 .xlsx 文件的内容。针对不同的任务，你有不同的工具和工作流可用。

## 重要要求

**公式重算需要 LibreOffice**：你可以假定已安装 LibreOffice，用于通过 `scripts/recalc.py` 脚本重算公式值。该脚本会在首次运行时自动配置 LibreOffice，包括在 Unix 套接字受限的沙箱环境中（由 `scripts/office/soffice.py` 处理）。

## 读取和分析数据

### 用 pandas 做数据分析
对于数据分析、可视化和基本操作，使用 **pandas**，它提供了强大的数据操作能力：

```python
import pandas as pd

# Read Excel
df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict

# Analyze
df.head()      # Preview data
df.info()      # Column info
df.describe()  # Statistics

# Write Excel
df.to_excel('output.xlsx', index=False)
```

## Excel 文件工作流

## 关键：使用公式，而不是硬编码值

**始终使用 Excel 公式，而不是在 Python 中计算值然后硬编码。** 这能确保电子表格保持动态和可更新。

### ❌ 错误 —— 硬编码计算值
```python
# Bad: Calculating in Python and hardcoding result
total = df['Sales'].sum()
sheet['B10'] = total  # Hardcodes 5000

# Bad: Computing growth rate in Python
growth = (df.iloc[-1]['Revenue'] - df.iloc[0]['Revenue']) / df.iloc[0]['Revenue']
sheet['C5'] = growth  # Hardcodes 0.15

# Bad: Python calculation for average
avg = sum(values) / len(values)
sheet['D20'] = avg  # Hardcodes 42.5
```

### ✅ 正确 —— 使用 Excel 公式
```python
# Good: Let Excel calculate the sum
sheet['B10'] = '=SUM(B2:B9)'

# Good: Growth rate as Excel formula
sheet['C5'] = '=(C4-C2)/C2'

# Good: Average using Excel function
sheet['D20'] = '=AVERAGE(D2:D19)'
```

这适用于所有计算——总计、百分比、比率、差值等。当源数据变化时，电子表格应该能够重新计算。

## 常见工作流
1. **选择工具**：数据用 pandas，公式/格式用 openpyxl
2. **创建/加载**：创建新工作簿或加载已有文件
3. **修改**：添加/编辑数据、公式和格式
4. **保存**：写入文件
5. **重算公式（使用公式时必做）**：使用 scripts/recalc.py 脚本
   ```bash
   python scripts/recalc.py output.xlsx
   ```
6. **验证并修复错误**：
   - 脚本返回带错误详情的 JSON
   - 如果 `status` 是 `errors_found`，检查 `error_summary` 中的具体错误类型和位置
   - 修复已识别的错误并再次重算
   - 需要修复的常见错误：
     - `#REF!`：无效的单元格引用
     - `#DIV/0!`：除以零
     - `#VALUE!`：公式中的数据类型错误
     - `#NAME?`：无法识别的公式名称

### 创建新的 Excel 文件

```python
# Using openpyxl for formulas and formatting
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active

# Add data
sheet['A1'] = 'Hello'
sheet['B1'] = 'World'
sheet.append(['Row', 'of', 'data'])

# Add formula
sheet['B2'] = '=SUM(A1:A10)'

# Formatting
sheet['A1'].font = Font(bold=True, color='FF0000')
sheet['A1'].fill = PatternFill('solid', start_color='FFFF00')
sheet['A1'].alignment = Alignment(horizontal='center')

# Column width
sheet.column_dimensions['A'].width = 20

wb.save('output.xlsx')
```

### 编辑已有的 Excel 文件

```python
# Using openpyxl to preserve formulas and formatting
from openpyxl import load_workbook

# Load existing file
wb = load_workbook('existing.xlsx')
sheet = wb.active  # or wb['SheetName'] for specific sheet

# Working with multiple sheets
for sheet_name in wb.sheetnames:
    sheet = wb[sheet_name]
    print(f"Sheet: {sheet_name}")

# Modify cells
sheet['A1'] = 'New Value'
sheet.insert_rows(2)  # Insert row at position 2
sheet.delete_cols(3)  # Delete column 3

# Add new sheet
new_sheet = wb.create_sheet('NewSheet')
new_sheet['A1'] = 'Data'

wb.save('modified.xlsx')
```

## 重算公式

由 openpyxl 创建或修改的 Excel 文件，公式以字符串形式存在但没有计算值。使用提供的 `scripts/recalc.py` 脚本重算公式：

```bash
python scripts/recalc.py <excel_file> [timeout_seconds]
```

示例：
```bash
python scripts/recalc.py output.xlsx 30
```

该脚本：
- 首次运行时自动设置 LibreOffice 宏
- 重算所有工作表中的所有公式
- 扫描所有单元格中的 Excel 错误（#REF!、#DIV/0! 等）
- 返回带详细错误位置和计数的 JSON
- 同时支持 Linux 和 macOS

## 公式验证清单

快速检查以确保公式工作正确：

### 基本验证
- [ ] **测试 2-3 个示例引用**：在构建完整模型前验证它们拉取的值正确
- [ ] **列映射**：确认 Excel 列匹配（例如第 64 列 = BL，而不是 BK）
- [ ] **行偏移**：记住 Excel 行是从 1 开始索引的（DataFrame 第 5 行 = Excel 第 6 行）

### 常见坑
- [ ] **NaN 处理**：用 `pd.notna()` 检查空值
- [ ] **最右侧列**：财年数据常在 50+ 列
- [ ] **多个匹配**：搜索所有出现位置，而不是只找第一个
- [ ] **除以零**：在公式中使用 `/` 前检查分母（#DIV/0!）
- [ ] **错误引用**：验证所有单元格引用都指向预期的单元格（#REF!）
- [ ] **跨工作表引用**：使用正确的格式（Sheet1!A1）链接工作表

### 公式测试策略
- [ ] **从小处开始**：在大范围应用前先在 2-3 个单元格上测试公式
- [ ] **验证依赖**：检查公式中引用的所有单元格都存在
- [ ] **测试边缘情况**：包含零、负数和非常大的值

### 解读 scripts/recalc.py 输出
脚本返回带错误详情的 JSON：
```json
{
  "status": "success",           // or "errors_found"
  "total_errors": 0,              // Total error count
  "total_formulas": 42,           // Number of formulas in file
  "error_summary": {              // Only present if errors found
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
```

## 最佳实践

### 库的选择
- **pandas**：最适合数据分析、批量操作和简单数据导出
- **openpyxl**：最适合复杂格式、公式和 Excel 特定功能

### 使用 openpyxl
- 单元格索引从 1 开始（row=1, column=1 指单元格 A1）
- 用 `data_only=True` 读取计算值：`load_workbook('file.xlsx', data_only=True)`
- **警告**：如果用 `data_only=True` 打开并保存，公式会被替换为值且永久丢失
- 大文件：读取用 `read_only=True`，写入用 `write_only=True`
- 公式会被保留但不会被求值——使用 scripts/recalc.py 更新值

### 使用 pandas
- 指定数据类型以避免推断问题：`pd.read_excel('file.xlsx', dtype={'id': str})`
- 大文件只读取特定列：`pd.read_excel('file.xlsx', usecols=['A', 'C', 'E'])`
- 正确处理日期：`pd.read_excel('file.xlsx', parse_dates=['date_column'])`

## 代码风格指南
**重要**：生成 Excel 操作的 Python 代码时：
- 编写精简、简洁的 Python 代码，不带不必要的注释
- 避免冗长的变量名和冗余操作
- 避免不必要的 print 语句

**对于 Excel 文件本身**：
- 为包含复杂公式或重要假设的单元格添加批注
- 为硬编码值记录数据来源
- 为关键计算和模型部分添加说明
