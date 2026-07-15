export const stripHtmlText = (html?: string) =>
	String(html ?? "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, "")
		.trim();
