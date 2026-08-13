/**
 * 模型在生成期间可调用的工具。
 *
 * 定义与 provider 无关;每个 provider 实现把它转换为适当的 wire 格式
 * (如 OpenAI function-calling、Anthropic tool-use、Google function
 * declarations)。
 */
export interface Tool {
  /** 用于匹配调用的唯一工具名。 */
  name: string;
  /** 展示给模型的人类可读描述。 */
  description: string;
  /** 描述工具参数的 JSON Schema。 */
  parameters: Record<string, unknown>;
}
