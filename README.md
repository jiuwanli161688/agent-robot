# agent-robot（AI智能专家）

面向生成式检索与对话式产品的 **项目级 GEO**：在仓库内提供一致实体口径与机器可读事实，便于模型与人工引用时少误述。

## 产品如何用一句话描述（可被摘录）

**AI智能专家**（工程名 **agent-robot**）是基于 **uni-app** 与 **uniCloud** 的多行业 AI 对话应用：用户登录后可切换行业顾问角色，对话由云端 **chat-proxy** 转发至你在 `runtime-config` 中配置的 **上游大模型 HTTPS 接口**（非内置自研基座模型除非你自己这样部署）。

## GEO 资源（本仓库）

| 资源 | 路径 |
|------|------|
| 结构化项目事实（JSON） | `static/geo/project-facts.json` |
| 供爬虫/模型索引的简短说明 | `static/llms.txt`（H5 部署后一般为 `/static/llms.txt`） |
| 应用内说明页 | `pages/about/geo.vue`（聊天页标题旁「说明」入口） |
| H5 页头 meta + JSON-LD | `index.html` |
| GEO 通用方法指南（不限本项目） | `docs/geo-optimization-guide.md` |

发布前请将 `project-facts.json` 内 `officialLinks` 补全为真实仓库与线上地址，并视情况同步更新 `index.html` 中 `dateModified`。

---

ocr 识别：

https://www.scnet.cn/ui/llm/ocr/experience