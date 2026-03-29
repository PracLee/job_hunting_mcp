/**
 * LLM 클라이언트 추상화
 * 지원: Anthropic Claude / OpenAI / Ollama (로컬)
 * 각 사용자가 .env에서 provider를 선택
 */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system?: string;
  messages: LlmMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LlmClient {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

// --- Anthropic ---
class AnthropicClient implements LlmClient {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const response = await client.messages.create({
      model: this.model,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature ?? 0.7,
      system: request.system || '',
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      content: textBlock ? textBlock.text : '',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}

// --- OpenAI ---
class OpenAIClient implements LlmClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push(...request.messages);

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API 에러: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}

// --- Ollama (로컬 LLM) ---
class OllamaClient implements LlmClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3';
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const prompt = this.buildPrompt(request);

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.max_tokens || 4096,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama 에러: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as { response: string };
    return { content: data.response };
  }

  private buildPrompt(request: LlmRequest): string {
    let prompt = '';
    if (request.system) {
      prompt += `[시스템]\n${request.system}\n\n`;
    }
    for (const msg of request.messages) {
      const label = msg.role === 'user' ? '사용자' : '어시스턴트';
      prompt += `[${label}]\n${msg.content}\n\n`;
    }
    return prompt;
  }
}

// --- Factory ---
let clientInstance: LlmClient | null = null;

export type LlmProvider = 'anthropic' | 'openai' | 'ollama';

export function getLlmClient(): LlmClient {
  if (clientInstance) return clientInstance;

  const provider = (process.env.LLM_PROVIDER || 'anthropic') as LlmProvider;

  switch (provider) {
    case 'anthropic':
      clientInstance = new AnthropicClient();
      break;
    case 'openai':
      clientInstance = new OpenAIClient();
      break;
    case 'ollama':
      clientInstance = new OllamaClient();
      break;
    default:
      throw new Error(`지원하지 않는 LLM provider: ${provider}. anthropic, openai, ollama 중 선택하세요.`);
  }

  return clientInstance;
}

export function resetLlmClient(): void {
  clientInstance = null;
}
