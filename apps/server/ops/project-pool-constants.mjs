
// 制作阶段(ops 自有字段,固定顺序即流程):资产确认 → 场景单帧版本 → 可交互初版 → 功能完整版 → 最终交付版
export const PROJECT_STAGES = ["资产确认", "场景单帧版本", "可交互初版", "功能完整版", "最终交付版"];

// 新项目默认第 1 阶段
export const DEFAULT_STAGE = PROJECT_STAGES[0];

// 带此标签的成员 = 该项目策划(可改状态/阶段)
export const PLANNER_TAG = "制片";

// 项目池过滤的 客户，后续需要直接添加
export const EXCLUDED_CLIENT_NAMES = ["test"];
