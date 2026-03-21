# Cubox API Map

这个文档基于 `cubox.pro.har` 的抓包结果整理，并且额外用只读 `GET` 请求做过一次在线验证。结论是：当前这批接口的核心认证方式是 `authorization` header，Cookie 不是必需项。

## 认证与最小请求头

观察到的最小可用组合：

- `authorization: <token>`
- `accept: application/json`

实测只带这两个头就能成功调用至少这些只读接口：

- `GET /c/api/norm/card/search/preview`
- `GET /c/api/norm/card/query`
- `GET /c/api/norm/card/detail`
- `GET /c/api/v2/group/my`
- `GET /c/api/norm/tag/list`

浏览器里还会额外带上 `accept-language`、`referer`、`user-agent` 等头，但当前不是硬性要求。

## 已观察到的接口

### `GET /c/api/userInfo`

用途：

- 验证当前 token 是否有效
- 获取账号基础信息

结论：

- 适合拿来做连通性检查
- 当前 skill 没必要默认调用它，除非要专门诊断认证问题

### `GET /c/api/group/my/other`

用途：

- 获取一些聚合数量

返回里出现过：

- `unreadSize`
- `allSize`
- `inboxSize`
- `todaySize`
- `starSize`

### `GET /c/api/v2/group/my`

用途：

- 获取所有收藏夹或分组列表

典型字段：

- `groupId`
- `groupName`
- `parentGroupId`
- `archiving`
- `size`

适合：

- 在做主题研究前先看有哪些 collection 可以辅助判断语境

### `GET /c/api/norm/tag/list`

用途：

- 获取标签列表

典型字段：

- `tagId`
- `name`
- `path`

适合：

- 在 topic 很宽泛时，先看看现有 tag 体系

### `GET /c/api/norm/card/keyword/list`

用途判断：

- 名字看起来像“关键词列表”
- 但实际返回更像“首页推荐上下文”或“最近/常用卡片与部分分组内容”

观察到的返回结构：

- `data.cards`: 一组文章卡片
- `data.content`: 一组分组对象，`type` 目前看到是 `4`

结论：

- 这个接口不是全文搜索
- 更像“辅助上下文”接口，适合做预热或 UI 上下文

### `GET /c/api/norm/card/search/preview`

用途：

- 前缀联想或轻量模糊搜索

典型 query 参数：

- `keyword`
- `page`
- `pageSize`
- `archiving`

返回特征：

- 标题和描述里会带 `<strong>` 高亮
- `totalCounts` 通常比全文搜索更小

适合：

- 探路
- 看看某个词有没有明显命中
- 帮助 agent 扩展关键词

不适合：

- 单独作为“充分查找”的唯一依据

### `GET /c/api/norm/card/query`

这是主搜索接口，但有两种模式。

#### 快速搜索

典型参数：

- `searchMode=quick`
- `orderType=4`
- `keyword=...`
- `page=...`
- `archiving=false`

用途判断：

- 更偏标题、描述、元数据层面的匹配

#### 全文搜索

典型参数：

- `searchMode=full-text`
- `orderType=5`
- `keyword=...`
- `page=...`
- `archiving=false`

用途判断：

- 正文全文搜索
- 用来找那些标题不明显，但正文真正相关的文章

结论：

- 如果用户要“充分查找”，一定要把 `quick` 和 `full-text` 都跑一遍
- skill 里的主脚本就是按这个思路做的

### `GET /c/api/norm/card/query/count`

用途：

- 只返回某个搜索条件下的数量

典型参数跟 `query` 基本一致。

结论：

- 适合 UI 做数量展示
- 对 skill 来说不是刚需，因为 `query` 本身已经返回了 `totalCounts`

### `GET /c/api/norm/card/detail`

典型参数：

- `cardId`

用途：

- 拉取单篇文章详情

关键字段：

- `cardId`
- `title`
- `url`
- `domain`
- `content`

关键结论：

- `content` 不是完整网页，而是 Cubox 清洗后的 HTML 片段
- 里面会出现 `img`、`video`、文件链接等元素
- 图片常见字段是 `data-cubox-image-src`

这也是 skill 里需要再做二次处理的原因：

- 先把图片下载到本地
- 再把 HTML 片段转成 Markdown

### `POST /c/api/norm/card/read`

用途：

- 标记已读

观察到的 form body：

- `cardIds=<id>`
- `isRead=true`

结论：

- 这是有副作用的接口
- 主题研究 skill 默认不应该调用

### 其他只读接口

- `GET /c/api/mark/count`
- `GET /c/api/settings/read`

当前这两个接口跟主题检索主流程关系不大，所以脚本没有依赖它们。

## 这套 Skill 的实现决策

基于上面的接口特征，skill 采用了这几个固定决策：

1. 认证只要求 `.env` 里配置 `CUBOX_AUTHORIZATION`。
2. 主搜索流程同时跑 `preview`、`quick`、`full-text`。
3. 结果按 `cardId` 去重，不按标题去重。
4. 详情落盘到系统临时目录下的 `cubox-collection/`，每篇文章一个独立子目录。
5. 文章正文优先读取 `article.md`，不要求 agent 自己再去啃原始 HTML。

