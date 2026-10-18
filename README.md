# careermate-web

> CareerMate 的前端：简历上传 → JD 匹配 → 流式模拟面试 → 评估报告。

后端仓库见同级目录 `careermate`。

---

## 技术栈

| 项 | 选型 | 说明 |
|---|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） | |
| 构建 | Vite 6 | |
| 状态 | Pinia | 两个 store：业务状态、错误状态 |
| HTTP | axios | 统一错误拦截 |
| 样式 | 手写 CSS | 未引入组件库，见下方「为什么不用 Element Plus」 |

---

## 快速开始

```powershell
npm install
npm run dev
```

打开 **http://localhost:5173**。

> **必须用 `localhost`，不能用 `127.0.0.1`。** Vite 默认只绑 `localhost`，在 Windows 上它解析到 IPv6 的 `::1`，用 IPv4 的 `127.0.0.1:5173` 连不上。

前置条件：后端已在 8080 运行。页面顶部的「后端组件」状态条会直接显示六个组件的连通性，红项鼠标悬停可看原因。

生产构建：

```powershell
npm run build      # 产物在 dist/
```

---

## 目录结构

```
src/
├── api/
│   ├── http.js          # axios 实例 + 错误归一化（本项目的核心之一）
│   └── index.js         # 6 个接口封装 + 手写 SSE 解析
├── stores/
│   ├── errors.js        # 错误横幅 + 历史记录
│   └── session.js       # 简历 / JD / 匹配结果 / 面试会话 / 报告
├── components/
│   ├── ErrorBanner.vue      # 粘性错误横幅
│   ├── ResumePanel.vue      # ① 上传简历
│   ├── JdPanel.vue          # ② JD 匹配
│   ├── InterviewPanel.vue   # ③ 模拟面试 + 报告
│   └── JsonView.vue         # 可折叠的原始 JSON
├── App.vue              # 布局、组件状态条、步骤进度、错误历史
├── styles.css
└── main.js
```

---

## 核心设计：错误必须看得见

这个项目最初的诉求就是"把错误显示出来"。做法是**任何失败都归一化成同一个结构**，页面只负责渲染：

```js
{
  scope,    // 哪个业务动作失败了（上传简历 / JD 匹配 / 面试对话 …）
  method,   // HTTP 方法
  url,      // 请求路径
  status,   // HTTP 状态码；null 表示请求根本没发出去
  message,  // 后端给出的可读原因
  detail,   // 后端原始响应（可折叠展示）
  fix,      // 针对这类错误的排查建议
}
```

为什么不直接 `catch (e) { alert(e) }`：axios 的错误对象在浏览器里结构不固定（超时、4xx、网络错误混在一起，`response` 有时为空、`data` 有时是字符串），直接展示只能得到 `[object Object]` 或 `Request failed with status code 400` —— **后端真正给出的原因被丢掉了**。

按错误类型区分处理：

| 类型 | 页面显示 | 设计理由 |
|---|---|---|
| HTTP 4xx | 状态码 + 后端中文原因 + 修复方向 | 例如传了 `.docx`，直接显示「目前只支持 PDF 简历，收到的文件名：xxx.docx」 |
| HTTP 5xx | 状态码 + 原始 JSON（可折叠）+ 「去看后端控制台最后 30 行堆栈」 | 5xx 的根因永远不在前端，必须把人指向日志 |
| 网络 / 后端未启动 | 「无法连接后端」+ 提示确认 `/health` 与代理端口 | 此时 `response` 为空，不特殊处理只能显示 `Request failed` |
| 超时（180s） | 明确说明超过 180 秒，可能是模型卡住 | 模型调用慢，超时必须与网络错误区分开 |
| 流式接口中途失败 | 在解析 body 之前拦住非 2xx，解析 JSON 错误体后抛出 | 否则一个 503 的 JSON 会被当成文本流，显示成一串乱码 |
| 前端参数缺失 | 本地直接报错，不发请求 | 例如没选文件就点上传 |

> **后端的配合项**：`application.yml` 里的 `server.error.include-message: always`。Spring Boot 3 默认是 `never`，那样 `ResponseStatusException` 里的中文说明不会出现在响应体中，前端的错误展示就只剩状态码。

---

## SSE 为什么用 fetch 而不是 EventSource

后端的 `/api/interview/chat` 是 **POST**，而浏览器原生的 `EventSource` **只支持 GET**。所以只能用 `fetch` 拿到 `ReadableStream` 后自己解析 SSE 帧：

- 按 `\n\n` 切分事件帧
- 取出 `data:` 开头的行，多行 `data` 按规范用 `\n` 拼接
- 兼容 `\r\n` 行尾（不同环境可能不同）

---

## 为什么不用 Element Plus

依赖少一半（安装快、无版本冲突），且**错误展示的样式完全可控** —— 组件库的默认 message/toast 很难定制成上面那种"四要素 + 可折叠原始响应"的结构。

如果需要补充表单控件，引入 Element Plus 不会与现有代码冲突。

---

## 两个踩过的样式坑

### 1. `label` 默认是 `display: inline`

上传区最初用的是 `<label class="dropzone">`（为了让点击它等于点击内部的 `<input type="file">`）。但 `label` 默认是 `inline` 元素，**inline 元素上的 padding/border 不会撑开盒子**，边框会画到行高里面去，看起来就是"框错位"。

修法：显式 `display: block; width: 100%`。

### 2. 同特异性类名同时挂载时，谁写在后面谁生效

最初用 `class="ghost" :class="{ primary: active }"` 做选中态，但 `.primary` 和 `.ghost` 特异性相同，而 `.ghost` 写在 `.primary` 后面 —— 于是选中态永远显示不出来，按钮看起来"点了没反应"。

修法：不再用"叠加两个语义类"表达状态，改用独立的分段控件类（`.seg` + `.seg.active`，双类特异性更高，与书写顺序无关）。

---

## 与后端的分工

前端**不做任何业务判断**，只做三件事：

1. 收集输入、调用接口、展示结果
2. 归一化并展示错误
3. 维持会话状态（**因为后端是无状态的**：`/api/jd/match` 与 `/api/interview/start` 都要求客户端回传完整的 `ResumeProfile`）

所有评分、技能判断、面试出题与点评全部由后端的 DeepSeek 调用产生；RAG 检索是向量相似度计算。
