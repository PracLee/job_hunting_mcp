/**
 * LLM 클라이언트 — 로컬 LLM 전용
 *
 * 이 MCP는 개인 로컬 환경에서 동작하는 것이 원칙.
 * 외부 API(Anthropic, OpenAI 등)는 사용하지 않고,
 * Ollama 또는 OpenAI 호환 로컬 서버(LM Studio, vLLM 등)만 지원.
 *
 * 지원 방식:
 *   1. ollama  — Ollama 로컬 서버 (기본값)
 *   2. openai-compatible — OpenAI API 호환 로컬 서버 (LM Studio, vLLM, text-generation-webui 등)
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

// --- Ollama (로컬 LLM, 기본값) ---
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

// --- OpenAI 호환 로컬 서버 (LM Studio, vLLM, text-generation-webui 등) ---
class OpenAICompatibleClient implements LlmClient {
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1';
    this.model = process.env.LOCAL_LLM_MODEL || 'local-model';
    this.apiKey = process.env.LOCAL_LLM_API_KEY || 'not-needed';
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
      throw new Error(`로컬 LLM 서버 에러: ${res.status} ${await res.text()}`);
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

// --- Factory ---
let clientInstance: LlmClient | null = null;

export type LlmProvider = 'ollama' | 'openai-compatible';

export function getLlmClient(): LlmClient {
  if (clientInstance) return clientInstance;

  const provider = (process.env.LLM_PROVIDER || 'ollama') as LlmProvider;

  switch (provider) {
    case 'ollama':
      clientInstance = new OllamaClient();
      break;
    case 'openai-compatible':
      clientInstance = new OpenAICompatibleClient();
      break;
    default:
      throw new Error(`지원하지 않는 LLM provider: ${provider}. ollama 또는 openai-compatible 중 선택하세요.`);
  }

  return clientInstance;
}

export function resetLlmClient(): void {
  clientInstance = null;
}
