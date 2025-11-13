// 文本向量生成
// 集成 OpenAI 的 embedding API（如 text-embedding-ada-002），或其他开源向量化 API，获得高质量向量。
// 可以做一个大概预估 index 价格的功能，简单算一下token数量或者字符数量算一下价格告诉用户先
// 70w token 调用 openai 的这个 embedding 价格大概花个几块rmb就，半刀其实

// 索引管理
// 使用 PGVector 来存储
export {};