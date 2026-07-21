// 注意:该模板需要与 soyoo-playable-helper-admin/src/constants/stagePlanTemplates.ts 保持一致。
// workdayIndexes 表示从【资产确认】日期开始数,每个阶段在第几个工作日交付。
export type StagePlanTemplateKey = "1w" | "2w" | "3w" | "4w";

export type StagePlanTemplate = {
	key: StagePlanTemplateKey;
	label: string;
	workdayIndexes: Record<string, number>;
};

export const STAGE_PLAN_TEMPLATES: StagePlanTemplate[] = [
	{
		key: "1w",
		label: "1周",
		workdayIndexes: {
			asset_confirm: 1,
			scene_still: 2,
			interactive_alpha: 2,
			feature_complete: 4,
			final_delivery: 5,
		},
	},
	{
		key: "2w",
		label: "2周",
		workdayIndexes: {
			asset_confirm: 1,
			scene_still: 2,
			interactive_alpha: 2,
			feature_complete: 5,
			final_delivery: 10,
		},
	},
	{
		key: "3w",
		label: "3周",
		workdayIndexes: {
			asset_confirm: 1,
			scene_still: 3,
			interactive_alpha: 3,
			feature_complete: 6,
			final_delivery: 15,
		},
	},
	{
		key: "4w",
		label: "4周",
		workdayIndexes: {
			asset_confirm: 1,
			scene_still: 3,
			interactive_alpha: 4,
			feature_complete: 7,
			final_delivery: 23,
		},
	},
];

export const DEFAULT_STAGE_PLAN_TEMPLATE_KEY: StagePlanTemplateKey = "4w";

export const getStagePlanTemplate = (key: string | undefined) => STAGE_PLAN_TEMPLATES.find((item) => item.key === key) || STAGE_PLAN_TEMPLATES.find((item) => item.key === DEFAULT_STAGE_PLAN_TEMPLATE_KEY) || STAGE_PLAN_TEMPLATES[0];
