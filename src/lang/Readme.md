# 语言文件与翻译维护

[项目首页](../../README.md) · [文档总索引](../../doc/README.md)

本目录保存语言消息与注册逻辑。当前 [index.ts](index.ts) 注册简体中文、繁体中文、英语与韩语，对应 `zh-cn.json`、`zh-tw.json`、`en-us.json`、`ko-kr.json`；[i18n.ts](i18n.ts) 负责运行时访问。

## 修改与新增翻译

1. 修改功能文案时，同步检查四个语言文件的键、插值和语义，保留已有翻译。
2. 新增语言使用 `<locale>.json` 文件，并更新 `index.ts` 中的导入与注册；下方参考列表并不表示这些语言当前均已启用。
3. JSON 必须可解析；替换参数、HTML 或富文本相关内容需遵循调用组件现有约定，不直接加入可执行代码。
4. 在设置中切换语言，检查新增文案、按钮宽度、缺失键和回退行为。验证范围见 [验证指南](../../doc/guides/validation.md)。

## Locale 命名参考

新增语言文件的 locale 可参照以下命名：

- `ar-sa` - Arabic Saudi Arabia
- `cs-cz` - Czech Czech Republic
- `da-dk` - Danish Denmark
- `de-de` - German Germany
- `el-gr` - Modern Greek Greece
- `en-au` - English Australia
- `en-gb` - English United Kingdom
- `en-ie` - English Ireland
- `en-us` - English United States
- `en-za` - English South Africa
- `es-es` - Spanish Spain
- `es-mx` - Spanish Mexico
- `fi-fi` - Finnish Finland
- `fr-ca` - French Canada
- `fr-fr` - French France
- `he-il` - Hebrew Israel
- `hi-in` - Hindi India
- `hu-hu` - Hungarian Hungary
- `id-id` - Indonesian Indonesia
- `it-it` - Italian Italy
- `ja-jp` - Japanese Japan
- `ko-kr` - Korean Republic of Korea
- `nl-be` - Dutch Belgium
- `nl-nl` - Dutch Netherlands
- `no-no` - Norwegian Norway
- `pl-pl` - Polish Poland
- `pt-br` - Portuguese Brazil
- `pt-pt` - Portuguese Portugal
- `ro-ro` - Romanian Romania
- `ru-ru` - Russian Russian Federation
- `sk-sk` - Slovak Slovakia
- `sv-se` - Swedish Sweden
- `th-th` - Thai Thailand
- `tr-tr` - Turkish Turkey
- `zh-cn` - Chinese China
- `zh-hk` - Chinese Hong Kong
- `zh-tw` - Chinese Taiwan
