---
name: request-indexing
description: >-
  通过 opencli gsc request-indexing 在 Google Search Console 中为一个或多个 URL
  触发 Request indexing / Request again。用户提到 request indexing、请求收录、提交收录、
  GSC URL inspection、重新抓取、让 Google 重新索引某些页面，或给出一组页面 URL
  需要批量点击 Request indexing 时使用。
---

# request-indexing

对单个或多个 URL 执行 Google Search Console 的 `Request indexing`。

## 前置

1. `opencli doctor` 通过
2. 已安装 **gsc** 子插件：
   `opencli plugin install file://$(pwd)/packages/gsc`
   或 `opencli plugin install github:CoderLim/keyword-kits/gsc`
3. Chrome 中已登录有目标 property 权限的 Google 账号

## 默认做法

### 单个 URL

优先直接调用：

```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=180 opencli gsc request-indexing <url> --property <property> -f json
```

`--property` 优先传 `sc-domain:example.com`。如果用户明确使用 URL-prefix property，也可传完整前缀（带尾随 `/`）。

### 多个 URL

优先跑 skill 自带脚本：

```bash
node .claude/skills/request-indexing/scripts/request-indexing-batch.mjs \
  --property sc-domain:example.com \
  https://example.com/ \
  https://example.com/blog
```

或用文件：

```bash
node .claude/skills/request-indexing/scripts/request-indexing-batch.mjs \
  --property sc-domain:example.com \
  --file urls.txt
```

`urls.txt` 为每行一个 URL。

## 执行规则

1. 除非用户明确指定别的 property，否则优先使用 `sc-domain:...`
2. 多 URL 时按顺序逐个请求，不要并发打开多个 GSC 会话
3. 返回每个 URL 的最终状态；不要只说“已完成”
4. 如果页面已经显示 `Indexing requested`，但用户仍要求点击，继续执行 `Request again`
5. 如果页面是 `noindex`，仍可按用户要求点击，但要明确说明它不会因此被正常收录

## 输出格式

默认用简短 markdown 汇总：

```markdown
- https://example.com/: submitted
- https://example.com/foo: quota_or_already_requested
```

如果脚本输出 JSON，就提炼每个 URL 的 `status` / `message` 给用户，不直接倾倒大块原始日志。

## 注意

- `request-indexing` 依赖 GSC UI，文案或 DOM 变动时可能需要更新插件
- 若命令卡在 inspection 输入栏，可改用已知的 inspectionResultLink 或先在 GSC UI 中手动打开页面
- `URL is unknown to Google`、`Excluded by 'noindex' tag` 这类状态，仍可以点按钮，但效果取决于页面本身是否允许索引
