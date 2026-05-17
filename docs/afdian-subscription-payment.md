# 爱发电订阅与支付接入说明

本文档梳理 **agent-robot** 项目中与爱发电（AFDIAN）相关的 **支付通知、订阅权益与账号绑定** 的实现方式，便于产品、运营与运维对照部署与排障。

---

## 1. 定位与边界

| 项目 | 说明 |
|------|------|
| **支付发生在哪里** | 用户在 **爱发电站内** 为你的方案完成赞助 / 下单；本项目 **不接银行卡或微信支付宝直连**，只做「收款结果同步」与「应用内权益」。 |
| **默认集成形态** | **Webhook + 档位链接备注 BIND 自动绑定**，订单号认领兜底；不要求 OAuth。 |
| **Webhook 能否单独识别「应用里的哪个用户」** | Webhook 正文仍 **不带应用 userId**。推荐：**已登录用户**在订阅页选择档位 → 云对象下发带 `remark=BIND:<nonce>` 的爱发电下单链接 → Webhook 校验 **一次性 nonce**（集合 `afdian_bind_nonces`）后 **自动写入 `app_users`**。**兜底**：未登录或备注被清空时，可用 **订单号认领**。 |
| **官方文档** | [开发者 API 与 Webhook](https://guide.afdian.com/creator/developer)；爱发电另有 [OAuth2](https://guide.afdian.com/creator/oauth2) 文档供扩展参考，本仓库订阅主链路 **未使用 OAuth**。 |

---

## 2. 端到端流程（推荐路径）

```
用户（建议已登录）
    │
    ▼
「会员订阅」页 → 云对象 listSubscriptionPlans 读取 subscriber_plans 档位
    │
    ▼
点击某档「去订阅」→（已登录）refreshAfdianSubscription 刷新快照 → 同档 / 升档 / 降档 提示（见 §2.1）
    │
    ▼
getPlanSubscribeUrl（写入 BIND nonce）→ 跳转
    https://ifdian.net/order/create?plan_id=...&product_type=0&remark=BIND:xxxx&affiliate_code=
    （收银页请勿清空备注）
    │
    ▼
支付成功 → Webhook → 落库订单 + 镜像 → 解析 remark → 自动绑定 app_users
    │
    ├─►（兜底）订单号 claimOrderByTradeNo
    │
    ▼
「用户中心」/ 订阅页 → refreshAfdianSubscription / getSubscriptionStatus 同步权益
```

### 2.1 订阅页前置校验（`pages/subscriber/index.vue`）

已登录用户点击某一档位「去订阅」时，会先调用 **`refreshAfdianSubscription`**（等同云对象 **`getSubscriptionStatus`**）刷新 **`app_users` 快照** 至本地存储，再结合 **`subscriber_plans`** 做档位对比：

| 场景 | 判定依据 | 行为 |
|------|-----------|------|
| **无绑定或无有效订阅** | 未绑定爱发电身份，或 `afdianSubscription` 视为未在有效期 | 直接进入 **`getPlanSubscribeUrl`** → 跳转收银（BIND 备注）。 |
| **同档续订** | 当前快照 **`plan_id`** 与所选档位 **`plan_id`** 相同（且在有效期内） | 提示再次支付将 **叠加延长有效期**，确认后继续下单。 |
| **升档** | 所选档位 **`sort`** **大于** 当前解析出的 **`sort`** | 提示 **升级**，展示当前权益预计到期时间，确认后继续下单。 |
| **降档** | 所选 **`sort`** **小于** 当前 **`sort`** | **仅提示**，**不跳转支付**，要求到期后再更换低档。 |
| **无法匹配档位** | 在订但快照无 **`plan_id`**、且 **`planName`** 也无法与 `subscriber_plans.name` 对齐，导致 **`sort` 为 0** | 走 **`unknown_tier`**：提示以爱发电为准，确认后可继续跳转（**不拦截降档**，避免误杀）。 |

**约定：** **`subscriber_plans.sort` 数值越大表示档位越高**（用于升/降档比较）；请务必与业务定价一致。快照中的 **`plan_id`** 由 Webhook / 镜像刷新、`query-sponsor`、认领等路径写入（见 §4.2、§8）。

**要点：**

1. **档位**存 **云数据库 `subscriber_plans`**（含 `plan_id` 等与下单 URL 一致）；集合为空时云对象会 **自动插入 3 条示例**，上线前请改为真实 `plan_id`。  
2. **BIND nonce** 有效期约 **30 分钟**，单次使用；请在爱发电收银页 **保留备注** 字段内容。  
3. **Webhook 必须先成功**，订单才会入库；自动绑定或认领才有依据。  
4. 同一 `out_trade_no` **只能被一个应用账号** 认领（自动绑定会写入 `claimedByAppUserId`）。  
5. 前端升降档提示仅为 **下单前引导**；**权益时长与叠加规则以爱发电订单及 Webhook 镜像为准**。

---

## 3. 工程内模块一览

| 模块 | 路径 / 名称 | 职责 |
|------|-------------|------|
| Webhook 入口 | `uniCloud-alipay/cloudfunctions/afdian-webhook/index.js` | 收单、镜像、`BIND:` 备注自动关联应用用户。 |
| 业务云对象 | `uniCloud-alipay/cloudfunctions/afdian-subscriber/index.obj.js` | `listSubscriptionPlans`、`getPlanSubscribeUrl`、订单认领、订阅状态刷新（含 `query-sponsor` 兜底）。 |
| 档位 Schema | `uniCloud-alipay/database/subscriber_plans.schema.json` | `subscriber_plans` 表结构（需上传至服务空间）。 |
| Webhook 订单 / 镜像 Schema | `afdian_webhook_orders.schema.json`、`afdian_patron_mirror.schema.json` | Webhook 落库订单与赞助到期镜像字段定义。 |
| 云端配置 | `uniCloud-alipay/cloudfunctions/afdian-subscriber/runtime-config.json` | API Token、Webhook 密钥、创作者主页 URL 等（无 OAuth 项）。 |
| 订阅页 | `pages/subscriber/index.vue` | 档位列表；已登录时先刷新订阅快照再区分 **同档 / 升档 / 降档** 提示后跳转收银（BIND）。 |
| 用户中心 | `pages/user/center.vue` | 展示头像/邮箱及爱发电订阅摘要，入口跳转订阅页。 |
| 对话页 | `pages/chat/index.vue` | 顶部「我的」进入用户中心。 |
| 前端 API | `apis/subscriber.js` | `listSubscriptionPlans`、`getPlanSubscribeUrl`、`refreshAfdianSubscription`、`claimAfdianOrder`。 |
| 路由 | `pages.json` | `subscriber/*`、`user/center`。 |

---

## 4. 数据库集合与应用用户字段

### 4.1 集合（由云函数读写）

| 集合名 | 用途 |
|--------|------|
| `subscriber_plans` | **订阅档位**：`plan_id`、`name`、`priceLabel`、`perks`、`sort`、`enabled` 等；用于拼装 `ifdian.net/order/create` 链接。 |
| `afdian_bind_nonces` | **备注绑定令牌**：`nonce`、`userId`、`expiresAt`、`used`；与订单 `remark=BIND:nonce` 对应。详见 Schema：`afdian_bind_nonces.schema.json`。 |
| `afdian_webhook_orders` | **Webhook 成功订单副本**：支付成功（`status=2`）时写入；供 **`BIND` 自动绑定**更新认领字段、**订单号认领**按 `out_trade_no` 查询、以及对账排障（含 **`rawOrder`**）。详见 **`afdian_webhook_orders.schema.json`** 与下表。 |
| `afdian_patron_mirror` | **赞助到期镜像**：按爱发电用户维度（**`patronKey`**）维护 **`expireAtSec`**；每次 Webhook 成功一单叠加续期；**`getSubscriptionStatus`** 优先读镜像判断是否在订并回填 **`plan_id`**。详见 **`afdian_patron_mirror.schema.json`** 与下表。 |
| `afdian_oauth_states` | 历史遗留（若曾接入 OAuth）；当前实现不再使用，可择机清理数据或删除集合。 |

#### `afdian_webhook_orders` 字段说明

| 字段 | 类型（逻辑） | 说明 |
|------|----------------|------|
| `out_trade_no` | string | 爱发电订单号；**唯一**；认领入参。 |
| `user_id` / `user_private_id` | string | 赞助用户 ID；与开放平台一致。 |
| `patronKey` | string | `user_private_id` 优先，否则 `user_id`；与镜像表关联键。 |
| `plan_id` | string | 方案 ID。 |
| `month` | int | 赞助月数；参与镜像续期公式。 |
| `total_amount` / `show_amount` | string | 金额文案。 |
| `status` | int | 本项目写入时为 **2**（成功）。 |
| `product_type` | int | 0 常规 / 1 售卖。 |
| `planName` | string | 从订单 SKU 等解析的展示名。 |
| `rawOrder` | object | Webhook **原始 order**，含 `remark` 等。 |
| `receivedAt` | ms | 服务端收到推送时间。 |
| `receivedAtSec` | sec | Unix 秒；认领兜底算到期可用。 |
| `claimedByAppUserId` | string | **`app_users.userId`**；BIND 或认领后写入；初始 `''`。 |
| `claimedAt` | ms / null | 认领或绑定时间；未认领为 **null**。 |

#### `afdian_patron_mirror` 字段说明

| 字段 | 类型（逻辑） | 说明 |
|------|----------------|------|
| `patronKey` | string | **主键语义**（业务上唯一）：赞助者标识。 |
| `user_private_id` / `user_id` | string | 冗余，便于查询。 |
| `expireAtSec` | sec | **当前权益到期** Unix 秒；叠加规则见 §5。 |
| `lastOutTradeNo` | string | 最后一次推动续期的订单号。 |
| `planId` | string | 最近一笔订单的 `plan_id`；同步到用户快照 **`afdianSubscription.plan_id`**。 |
| `planName` | string | 最近解析的方案名。 |
| `updatedAt` | ms | 本条记录更新时间。 |

> 完整校验 Schema 见：`uniCloud-alipay/database/afdian_webhook_orders.schema.json`、`afdian_patron_mirror.schema.json`（需在控制台上传至服务空间）。

### 4.2 `app_users` 中与订阅相关的字段（Webhook 自动绑定或订单认领后写入）

| 字段 | 含义 |
|------|------|
| `afdianUserId` | 爱发电用户 ID。 |
| `afdianUserPrivateId` | 爱发电用户私密 ID（文档类比 unionid）。 |
| `afdianSubscription` | 订阅快照：`active`、`planName`、**`plan_id`**（与爱发电方案 ID 对齐，供订阅页比对档位）、`expireAt`（秒）、`source`（如 `webhook` / `api` / `none`）、`bindMode`（备注绑定成功时为 `remark_nonce`）、`checkedAt` 等。 |

---

## 5. 订阅有效期如何计算（Webhook 路径）

1. **Webhook** 收到 **支付成功**（`status === 2`）的订单后，根据订单里的 **`month`（赞助月数）** 做续期。  
2. **单次续期长度**：`month × 31 × 86400` 秒（按自然近似，非爱发电官方日历算法）。  
3. **叠加规则**：在镜像中取上一段 **`expireAtSec`** 与 **当前时间** 的较大值作为基准 `base`，再执行  
   `newExpireAtSec = base + month × 31 × 86400`。  
4. **幂等**：同一 `out_trade_no` 不会重复插入订单，也不会重复延长（重复推送被短路）。

若认领时镜像尚未写入（极端竞态），认领接口会用 **`receivedAtSec + month × 31 天`** 做兜底估算到期时间。

---

## 6. 配置说明（`afdian-subscriber/runtime-config.json`）

| 配置项 | 是否必填（主流程） | 说明 |
|--------|-------------------|------|
| `AFDIAN_CREATOR_HOME_URL` | 建议 | 订阅页「去爱发电支付」跳转的主页。 |
| `AFDIAN_CREATOR_USER_ID` | API / 刷新兜底需要 | 开放平台展示的创作者 **user_id**，用于签名调用 `query-sponsor`。 |
| `AFDIAN_API_TOKEN` | API / 刷新兜底需要 | 开放平台 API Token；**仅服务端使用**。 |
| `AFDIAN_WEBHOOK_SECRET` | 可选 | 若填写，Webhook 云函数会校验请求头 `x-webhook-secret` 或 `Authorization: Bearer …`；爱发电若不支持自定义头，需在网关代加或留空。 |

部署 **`afdian-subscriber`** 云对象后，修改 `runtime-config.json` 需 **重新上传** 该云对象（或你当前使用的配置下发方式），Webhook 通过 **读取同目录上级逻辑中指定的路径** 加载其中的 `AFDIAN_WEBHOOK_SECRET`（实现上为 `afdian-webhook` 读取 `../afdian-subscriber/runtime-config.json`）。

---

## 7. Webhook URL 与爱发电后台配置

1. 在 **HBuilderX** 中将 **`afdian-webhook`** 上传部署到对应 uniCloud 服务空间。  
2. 在 **uniCloud 控制台** 为该云函数开启 **HTTP 访问 / URL 化**，得到 **完整 HTTPS URL**。  
3. 若与现有 **`chat-proxy`** 同域（例如前端 `config/index.js` 中的 `API_BASE_URL`），可为 Webhook 单独配置路径，示例：  
   `https://<你的域名>/afdian-webhook`（**以控制台与实际网关为准**）。  
4. 将上述 **完整 URL** 填入 **爱发电开发者后台** 的 **Webhook / 订单通知地址**。  
5. 爱发电要求 HTTP **响应体根级 JSON** 为 **`{"ec":200,"em":""}`**（见[官方 Webhook 说明](https://guide.afdian.com/creator/developer)）。本项目云函数 **`return { ec: 200, em: '' }`**，符合 [uniCloud URL 化「返回 Object」](https://doc.dcloud.net.cn/uniCloud/http.html) 行为。  
6. **自定义域名 / 前置网关**：若外层仍出现 **`{"statusCode":…,"body":"…"}`** 整包响应，爱发电校验会失败；需在网关 **unwrap** 为纯 **`{"ec":200,"em":""}`**，或改用控制台提供的 URL 化地址测试对比。

---

## 8. 刷新订阅状态（`getSubscriptionStatus`）

逻辑概要：

1. 若应用用户已绑定爱发电身份，优先根据 **`afdian_patron_mirror`** 中的 **`expireAtSec`** 判断是否 **`active`**，并写入快照字段 **`plan_id`**（来自镜像 **`planId`**，与最后一笔推动镜像的订单方案一致）。  
2. 若配置了 **`AFDIAN_API_TOKEN` + `AFDIAN_CREATOR_USER_ID`**，在镜像不足以判断或需要兜底时，可再调用开放平台 **`query-sponsor`**（签名规则见官方文档）；解析结果中带 **`plan_id`**、`expire_time`；对 **`permanent === 1` 且 `expire_time` 为空或无效** 的方案，代码会使用 **远期兜底到期时间**，避免前端把永久权益误判为「未在订」。  

业务上可将 **`afdianSubscription.active`** 与 **`expireAt`** 作为「当前账号是否享有订阅权益」的依据；订阅页的升降档还依赖 **`plan_id` + `subscriber_plans.sort`**（具体产品规则由你在对话 / 网关等处自行校验）。

---

## 9. OAuth 说明

本仓库 **已移除 OAuth 绑定流程**（无回调页、无 `getAuthorizeUrl` / `exchangeCode`）。账号与爱发电身份的关联以 **`BIND:` 备注 + Webhook`** 为主，**订单号认领**（`claimOrderByTradeNo` / 前端 `claimAfdianOrder`）为兜底。若线上仍存在空的 **`afdian_oauth_states`** 集合或历史数据，可按运维策略删除。

---

## 10. 安全与运维建议

- **API Token、Webhook 密钥** 只放在 **云函数配置**，不要写入前端 `config`。  
- **`runtime-config.json` 若含真实密钥**，勿推送到公开 Git；泄露后应在爱发电后台 **重置 Token**。  
- Webhook 建议 **HTTPS**；若配置 **`AFDIAN_WEBHOOK_SECRET`**，需保证爱发电或前置网关能带上约定请求头，否则校验会一直失败（表现为回调被忽略但仍返回 200）。  
- 关注云函数 **日志** 与数据库 **`afdian_webhook_orders`**，便于核对漏单、重复推送与用户认领纠纷。

---

## 11. 常见问题（FAQ）

**Q：支付成功很久了，认领提示找不到订单？**  
A：先确认 Webhook URL 是否可达、爱发电是否推送成功、`afdian_webhook_orders` 是否已有该 `out_trade_no`；订单号是否手动输入错误。

**Q：同一订单能给两个应用账号用吗？**  
A：不能。第二次认领会提示已绑定其他账号。

**Q：不配置 API Token 可以吗？**  
A：可以仅靠 Webhook + 镜像维持有效期；「刷新」将主要依赖镜像；若镜像逻辑与官方计费不一致，可增加 API 兜底。

**Q：到期时间为什么和爱发电页面上不完全一致？**  
A：当前实现使用 **`month × 31 天`** 近似叠加，与官方自然月/方案细则可能有偏差；若要对齐官方，需要结合开放文档中的字段或额外接口细化规则。

**Q：升降档提示和爱发电页面不一致？**  
A：App 侧仅根据 **`subscriber_plans.sort`** 与快照 **`plan_id` / 名称匹配** 做提示；**最终以爱发电收银与订单为准**。请保证 **`sort` 与方案贵贱一致**，且快照 **`planName`** 尽量与档位 **`name`** 一致以便回退匹配。

**Q：爱发电后台校验 Webhook 地址时报 JSON 结构错误？**  
A：用 **`curl`** 看响应正文是否为 **`{"ec":200,"em":""}`**；若仍带 **`statusCode`/`body` 外壳**，见 **§7 第 6 条**（网关 unwrap）。

---

## 12. 相关官方链接

- [开发者 API 和 Webhook](https://guide.afdian.com/creator/developer)  
- [开发者 OAuth2](https://guide.afdian.com/creator/oauth2)  
- [开发者后台（示例）](https://afdian.net/dashboard/dev)

文档版本与仓库代码一致；若你后续改了续期算法、认领规则或订阅页档位策略，请同步更新本节与代码注释。
