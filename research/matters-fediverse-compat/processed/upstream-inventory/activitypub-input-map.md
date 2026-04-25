# ActivityPub Input Map

## Author And Meta Fields

| Field | Used in ActivityPub output | Where it lands |
| --- | --- | --- |
| `byline.author.webfDomain` | Yes | actor base URL, WebFinger subject host, aliases, inbox, outbox, followers collection, article URLs |
| `byline.author.userName` | Yes | WebFinger subject, `matters.town/@username` alias, `preferredUsername` |
| `byline.author.displayName` | Yes | actor `name` |
| `byline.author.description` | Yes | actor `summary` |
| `byline.author.ipnsKey` | Yes | IPNS alias in WebFinger |
| `meta.image` | Yes | actor `icon` |
| `byline.author.name` | No direct effect | not used by current ActivityPub builder |
| `byline.author.uri` | No direct effect | not used by current ActivityPub builder |
| `meta.title` / `meta.description` / `meta.siteDomain` / `meta.authorName` | No direct effect | homepage and feed only |

## Article Fields

| Field | Used in ActivityPub output | Where it lands |
| --- | --- | --- |
| `articles[].id` | Yes | object URL path |
| `articles[].slug` | Yes | object URL path fallback via slugify |
| `articles[].title` | Yes | object `content` first line |
| `articles[].summary` | Yes | object `summary` and object `content` |
| `articles[].createdAt` | Yes | `Create.published`, object `published`, actor `published` fallback |
| `articles[].tags` | Yes | object `tag` |
| `articles[].uri` | No | current builder ignores it |
| `articles[].sourceUri` | No | current builder ignores it |
| `articles[].image` | No | current builder ignores it |
| `articles[].content` | No | current builder ignores full article body and emits title + summary only |

## Implications

- 現有 ActivityPub 輸出比較像文章摘要廣播，不是完整長文 representation
- `Article` 類型與 full-body content 尚未進入目前 builder
- `webfDomain` 在型別上是 optional，但在實作上是 ActivityPub bundle 的硬需求
