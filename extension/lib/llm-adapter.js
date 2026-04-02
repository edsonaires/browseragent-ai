// BrowserAgent AI - LLM Adapter (Agnostic)
// Supports: OpenAI, Claude, Gemini, Ollama, and any OpenAI-compatible API

export class LLMAdapter {
  constructor(config) {
    this.provider = config.provider; // 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom'
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.systemPrompt = this.buildSystemPrompt();
  }

  buildSystemPrompt() {
    return `You are BrowserAgent AI, an advanced browser automation agent.

You have access to the following capabilities:
- Vision: You can see screenshots of the current page
- DOM Reading: You can read the accessibility tree of elements with references (ref_1, ref_2, etc)
- Actions: You can click, type, scroll, hover, select, check, and navigate
- Context: You can read page URL, title, HTML, and viewport information

When given a task, analyze the page context and plan your actions step by step.

Output your actions in this JSON format:
{
  "reasoning": "Brief explanation of your plan",
  "actions": [
    { "type": "click", "ref": "ref_5", "description": "Click login button" },
    { "type": "type", "ref": "ref_8", "value": "user@email.com", "description": "Enter email" },
    { "type": "wait", "value": 1000 },
    { "type": "screenshot", "description": "Capture result" }
  ]
}

Available action types:
- click: { type: "click", ref: "ref_X" | coordinate: {x, y} }
- type: { type: "type", ref: "ref_X", value: "text to type" }
- scroll: { type: "scroll", direction: "up"|"down"|"top"|"bottom" }
- hover: { type: "hover", ref: "ref_X" }
- select: { type: "select", ref: "ref_X", value: "option value" }
- checkbox: { type: "checkbox", ref: "ref_X", value: true|false }
- navigate: { type: "navigate", value: "https://url.com" }
- wait: { type: "wait", value: milliseconds }
- screenshot: { type: "screenshot" }

Be efficient and precise. Always verify the page state before taking actions.`;
  }

  async sendMessage(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 4096, stream = false } = options;

    switch (this.provider) {
      case 'openai':
        return await this.callOpenAI(messages, { temperature, maxTokens, stream });
      case 'claude':
        return await this.callClaude(messages, { temperature, maxTokens, stream });
      case 'gemini':
        return await this.callGemini(messages, { temperature, maxTokens, stream });
      case 'ollama':
        return await this.callOllama(messages, { temperature, maxTokens, stream });
      case 'custom':
        return await this.callCustom(messages, { temperature, maxTokens, stream });
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  // =============== OPENAI ===============
  async callOpenAI(messages, options) {
    const url = this.baseUrl || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o',
        messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: options.stream
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    if (options.stream) {
      return this.handleStream(response);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      model: data.model
    };
  }

  // =============== CLAUDE (ANTHROPIC) ===============
  async callClaude(messages, options) {
    const url = this.baseUrl || 'https://api.anthropic.com/v1/messages';
    
    // Convert messages format (Claude uses different format)
    const claudeMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-3-5-sonnet-20241022',
        system: this.systemPrompt,
        messages: claudeMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: options.stream
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
    }

    if (options.stream) {
      return this.handleStream(response);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: data.usage,
      model: data.model
    };
  }

  // =============== GEMINI (GOOGLE) ===============
  async callGemini(messages, options) {
    const url = this.baseUrl || 
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model || 'gemini-2.0-flash-exp'}:generateContent?key=${this.apiKey}`;
    
    // Convert messages to Gemini format
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: this.systemPrompt }] },
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.candidates[0].content.parts[0].text,
      usage: data.usageMetadata,
      model: this.model
    };
  }

  // =============== OLLAMA (LOCAL) ===============
  async callOllama(messages, options) {
    const url = this.baseUrl || 'http://localhost:11434/api/chat';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model || 'qwen2.5:14b',
        messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
        stream: options.stream,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (options.stream) {
      return this.handleOllamaStream(response);
    }

    const data = await response.json();
    return {
      content: data.message.content,
      model: data.model,
      usage: { total_tokens: data.eval_count }
    };
  }

  // =============== CUSTOM (OpenAI-compatible) ===============
  async callCustom(messages, options) {
    // Uses OpenAI format but with custom baseUrl
    return await this.callOpenAI(messages, options);
  }

  // =============== STREAMING ===============
  async *handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) yield content;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  async *handleOllamaStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  // =============== VISION SUPPORT ===============
  async sendWithVision(messages, screenshot, options = {}) {
    const visionMessage = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: screenshot.split(',')[1] // Remove data:image/png;base64, prefix
          }
        },
        { type: 'text', text: messages[messages.length - 1].content }
      ]
    };

    const updatedMessages = [...messages.slice(0, -1), visionMessage];
    return await this.sendMessage(updatedMessages, options);
  }
}

// Provider presets
export const LLM_PRESETS = {
  openai_gpt4: { provider: 'openai', model: 'gpt-4o', name: 'GPT-4o (OpenAI)' },
  openai_gpt35: { provider: 'openai', model: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  claude_sonnet: { provider: 'claude', model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  claude_haiku: { provider: 'claude', model: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  gemini_flash: { provider: 'gemini', model: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
  gemini_pro: { provider: 'gemini', model: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ollama_qwen: { provider: 'ollama', model: 'qwen2.5:14b', name: 'Qwen 2.5 14B (Local)' },
  ollama_llama: { provider: 'ollama', model: 'llama3.2:latest', name: 'Llama 3.2 (Local)' },
  ollama_deepseek: { provider: 'ollama', model: 'deepseek-r1:8b', name: 'DeepSeek R1 8B (Local)' }
};
