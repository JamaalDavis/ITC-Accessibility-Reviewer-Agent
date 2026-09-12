export function checkSdkResult(message: {
  subtype: string;
  is_error?: boolean;
  result?: string;
  errors?: string[];
  permission_denials?: unknown[];
}): void {
  if (message.subtype !== "success" || message.is_error) {
    let detail = message.result || message.errors?.join("; ") || message.subtype;
    for (const [name, value] of Object.entries(process.env)) {
      if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name) && value) detail = detail.split(value).join("[redacted]");
    }
    detail = detail.replace(/\b(?:sk-ant-|voc-)[\w.-]+/g, "[redacted]");
    throw new Error(`Claude request failed: ${detail}`);
  }
  if (message.permission_denials?.length) throw new Error("Claude tool access was denied. Check the Claude permission settings for mcp__accessibility__a11y_*.");
}
