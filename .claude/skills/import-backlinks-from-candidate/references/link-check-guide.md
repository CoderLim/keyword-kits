# 链接核验指南

用 agent-browser 逐条打开链接，判定「可发外链 + dofollow/nofollow」。

## 判定标准

| 信号 | 判定 |
|------|------|
| 评论区开放（WordPress "Leave a Reply" 表单含 "Your Website" 字段），且已有外部评论链接通过审核 | **可发**，看 rel 判定 dofollow/nofollow |
| 页面正文/侧栏/页脚存在无 rel 或仅 `noopener` 的外链（作者亲手放的外链） | 该站整体外链 dofollow，**可发**（若内容与你的站相关，可尝试投稿/邮箱联系） |
| 外链带 `rel="nofollow"` 或 `rel="ugc"` 或 `rel="external nofollow ugc"` | 该渠道外链 **nofollow** |
| 已通过审核的评论链接（如站点评论区的既有评论）均无 rel | 评论区 **dofollow**（罕见，注意与 `noopener` 区分，`noopener` 不算 nofollow） |

## 判定 rel 的方法

打开页面后，用 eval 一次性抓取所有外链的 rel（不要逐条点开）：

```bash
agent-browser open <url>
agent-browser wait --load networkidle
agent-browser eval 'JSON.stringify([...document.querySelectorAll("a[href]")].filter(a=>a.href.startsWith("http")).map(a=>({t:(a.textContent||"").trim().slice(0,30),href:a.href,rel:a.getAttribute("rel")||"(none)"})))'
```

重点看评论区用户链接（如 blumgi slime → blumgislime2.io 这类明显 SEO 评论）的 rel：

- 无 rel / 无 `nofollow` → **Dofollow**
- `rel="external nofollow ugc"` 或含 `nofollow`/`ugc` → **Nofollow**

## 判定 link_category（有限取值）

根据页面主题/域名类型，从以下规范取值中选**最匹配的一个**（不要自造新值）：

`General`（综合/无法归类）、`Technology`、`Software & SaaS`、`AI`、`Gaming`、`Marketing & SEO`、`Business & Startup`、`Finance`、`Education`、`Science`、`Health`、`Food`、`Travel`、`Lifestyle`、`Home & Garden`、`Arts & Design`、`Sports`、`Legal`、`Automotive`、`Real Estate`、`Entertainment`、`Blog`（个人博客）、`Social`（社交/社区）、`Tools Directory`（工具/目录站）

判断依据：

- 先看站点整体定位（about/首页/域名品牌），不是单篇文章。
- 偏科匹配时选最贴近的，如：手机评测站 → `Technology`，游戏论坛 → `Gaming`，留学论坛 → `Education`，摄影教程站 → `Arts & Design`。
- 两可时选更宽泛的（如科技博客 → `Technology` 而非 `Blog`）。
- 实在无法判断（无头绪/混合型）→ `General`，不选 `Unknown`（Unknown 只用于沿用 candidate 原值时）。

## 不确定 → 移除的信号

出现以下任一情况直接判定「不确定」，走 remove（不要硬猜）：

- 页面 404 / 跳转到无关页面 / 需要登录才能看到内容
- 无评论区、无留言表单、无投稿/联系入口
- 页面是纯播客/视频播放页等无任何可放置外链的位置
- 站点有明确反外链政策（如 nofollow 全站，且无评论区）
- 语言不明、内容无关、无法判断是否接受外部链接

## 效率要点

- 一条链接只开一次页面，`get text body` + `eval` 一次拿全：页面性质、评论区、rel。
- 批量任务用 `agent-browser --session` 并行会话加速，或串行逐条（默认）。
- 评论表单的 CAPTCHA 由人工阶段处理；本流程只负责「判定 + 记录」，不实际提交外链。
