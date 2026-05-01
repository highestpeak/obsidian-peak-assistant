---
tags: [refactor, skill, 中文]
---
# 技能系统重写

技能原本按"简单 / 流水线"分类，在新架构下这个区分退化为
"一次 query() vs 多次 query()"，不再是 runtime 的分叉点。
