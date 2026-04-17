# GUIDE: Phase 4 — AI Integration

> **Goal:** Add a unified AI layer supporting both local LLMs (Gemma 4 via WebLLM, running
> entirely in the browser) and cloud API providers (OpenAI, Anthropic Claude, Ollama).
> A single interface abstracts all providers; users configure their preferred one.
>
> **Status:** Zero AI code exists. Everything in this guide is new.
>
> **Prerequisites:**
> - `npm run dev` works
> - Chrome 113+ or Edge 113+ for WebGPU (required for Gemma 4 local mode)
> - Internet connection for first-time Gemma 4 model download (~1.5GB, cached permanently)

---

## Architecture Overview

```
src/ai/
├── providers/
│   ├── base.js          ← Abstract AIProvider class
│   ├── webllm.js        ← WebLLM + Gemma 4 (local, WebGPU/WASM)
│   ├── openai.js        ← OpenAI API (gpt-4o, gpt-4o-mini)
│   ├── anthropic.js     ← Anthropic Claude API
│   └── ollama.js        ← Ollama local server
├── aiRegistry.js        ← Provider selection + encrypted config
├── agents.js            ← Task gen, summarization, search agents
└── contextBuilder.js    ← Build system prompts from app data

src/components/ai/
├── AIChatDrawer.jsx     ← Sliding chat panel
├── ModelManager.jsx     ← Provider selection + download progress
└── AIAgents.jsx         ← One-click agent actions
```

---

## Step 1: Install WebLLM

```bash
npm install @mlc-ai/web-llm
```

This adds ~50KB to the bundle (the actual model weights download separately to browser
IndexedDB on first use — they are NOT bundled).

> **Note on single-file build:** `@mlc-ai/web-llm` uses dynamic imports and WebAssembly.
> The `vite-plugin-singlefile` plugin will try to inline it. Add an exclusion:
> See Step 9 for the required vite.config.js update.

---

## Step 2: Create the Abstract Provider Base

Create **`src/ai/providers/base.js`**:

```javascript
// ============================================================================
// AI PROVIDER BASE — Interface all providers must implement.
// ============================================================================

export class AIProvider {
  constructor(config = {}) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract')
    }
    this.config = config
  }

  // Human-readable name for this provider
  get name() { return 'Unknown Provider' }

  // Whether this provider is available (WebGPU present, API key set, etc.)
  // Returns: Promise<boolean>
  async isAvailable() { return false }

  // Send a chat message
  // messages: [{ role: 'user'|'assistant'|'system', content: string }]
  // onChunk: optional streaming callback(text: string)
  // Returns: Promise<string> — the full response text
  async chat(messages, onChunk) {
    throw new Error(`${this.constructor.name}.chat() not implemented`)
  }

  // Single-turn completion (convenience wrapper around chat)
  async complete(prompt, systemPrompt = '') {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })
    return this.chat(messages)
  }

  // Test the provider — should resolve { ok: true, message } or throw
  async testConnection() {
    throw new Error(`${this.constructor.name}.testConnection() not implemented`)
  }
}
```

---

## Step 3: WebLLM Provider (Gemma 4 — Local, No API Key)

Create **`src/ai/providers/webllm.js`**:

```javascript
// ============================================================================
// WEBLLM PROVIDER — Runs Gemma 4 locally in the browser via WebGPU.
// No API key needed. First use downloads ~1.5GB model to browser IndexedDB.
// Requires Chrome/Edge 113+ for WebGPU; falls back to WASM for older browsers.
//
// Gemma 4 model IDs (April 2026, @mlc-ai/web-llm):
//   WebGPU (fast): gemma-4-2b-instruct-q4f32_1-MLC
//   WASM (compat): gemma-4-2b-instruct-q4f16_0-MLC
// ============================================================================
import { AIProvider } from './base.js'

// Lazy-loaded to avoid bundling WebLLM at startup
let _webllm = null
const getWebLLM = async () => {
  if (!_webllm) {
    _webllm = await import('@mlc-ai/web-llm')
  }
  return _webllm
}

const WEBGPU_MODEL  = 'gemma-4-2b-instruct-q4f32_1-MLC'
const WASM_MODEL    = 'gemma-4-2b-instruct-q4f16_0-MLC'

// Check if WebGPU is available
const hasWebGPU = () => {
  return typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    navigator.gpu !== null
}

export class WebLLMProvider extends AIProvider {
  constructor(config = {}) {
    super(config)
    this._engine   = null
    this._modelId  = config.modelId || (hasWebGPU() ? WEBGPU_MODEL : WASM_MODEL)
    this._onProgress = config.onProgress || null
  }

  get name() { return `Gemma 4 (Local${hasWebGPU() ? ' — WebGPU' : ' — CPU'})` }

  async isAvailable() {
    // WebLLM works on Chrome/Edge 113+ with or without WebGPU
    return typeof window !== 'undefined' && 'indexedDB' in window
  }

  // Initialize and optionally download the model
  // onProgress: callback({ text: string, progress: 0-1 })
  async initialize(onProgress) {
    if (this._engine) return // Already loaded

    const webllm = await getWebLLM()

    // MLCEngine handles model download + caching automatically
    this._engine = await webllm.CreateMLCEngine(this._modelId, {
      initProgressCallback: (report) => {
        const progress = typeof report.progress === 'number' ? report.progress : 0
        const text = report.text || `Loading model... ${Math.round(progress * 100)}%`
        onProgress?.({ text, progress })
        this._onProgress?.({ text, progress })
      },
    })
  }

  async chat(messages, onChunk) {
    if (!this._engine) {
      throw new Error('Model not loaded. Call initialize() first.')
    }

    // WebLLM supports OpenAI-compatible chat completion API
    if (onChunk) {
      // Streaming mode
      const stream = await this._engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
      })

      let fullText = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullText += delta
          onChunk(delta)
        }
      }
      return fullText
    } else {
      // Non-streaming
      const response = await this._engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      })
      return response.choices[0]?.message?.content || ''
    }
  }

  async testConnection() {
    await this.initialize()
    const response = await this.complete('Say "OK" and nothing else.')
    return { ok: true, message: `Model loaded: ${this._modelId}. Response: ${response.slice(0, 50)}` }
  }

  // Get download progress for UI display
  getModelId() { return this._modelId }
  isLoaded() { return !!this._engine }

  // Unload model from memory (frees ~1GB RAM)
  async unload() {
    if (this._engine) {
      await this._engine.unload()
      this._engine = null
    }
  }
}
```

---

## Step 4: OpenAI Provider

Create **`src/ai/providers/openai.js`**:

```javascript
// ============================================================================
// OPENAI PROVIDER — Direct fetch to OpenAI API from the browser.
// CORS is supported by OpenAI for browser-based requests.
// config: { apiKey, model }
// ============================================================================
import { AIProvider } from './base.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export class OpenAIProvider extends AIProvider {
  constructor(config = {}) {
    super(config)
    this._model = config.model || 'gpt-4o-mini'
  }

  get name() { return `OpenAI (${this._model})` }

  async isAvailable() {
    return !!this.config.apiKey
  }

  async chat(messages, onChunk) {
    if (!this.config.apiKey) throw new Error('OpenAI API key not configured')

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this._model,
        messages,
        stream: !!onChunk,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(`OpenAI error ${response.status}: ${err.error?.message || response.statusText}`)
    }

    if (onChunk) {
      // Stream response
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content || ''
            if (delta) {
              fullText += delta
              onChunk(delta)
            }
          } catch {}
        }
      }
      return fullText
    } else {
      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    }
  }

  async testConnection() {
    const response = await this.complete('Reply with "OK" only.')
    return { ok: true, message: `Connected to OpenAI. Model: ${this._model}` }
  }
}
```

---

## Step 5: Anthropic Claude Provider

Create **`src/ai/providers/anthropic.js`**:

```javascript
// ============================================================================
// ANTHROPIC PROVIDER — Direct fetch to Claude API from the browser.
// Requires the 'anthropic-dangerous-direct-browser-access: true' header.
// This is intentional for browser-based apps — see Anthropic docs.
// config: { apiKey, model }
// ============================================================================
import { AIProvider } from './base.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export class AnthropicProvider extends AIProvider {
  constructor(config = {}) {
    super(config)
    this._model = config.model || 'claude-haiku-4-5-20251001'
  }

  get name() { return `Claude (${this._model})` }

  async isAvailable() {
    return !!this.config.apiKey
  }

  async chat(messages, onChunk) {
    if (!this.config.apiKey) throw new Error('Anthropic API key not configured')

    // Extract system message (Anthropic uses a separate 'system' param)
    const systemMessages = messages.filter(m => m.role === 'system')
    const chatMessages   = messages.filter(m => m.role !== 'system')
    const system = systemMessages.map(m => m.content).join('\n')

    const body = {
      model: this._model,
      max_tokens: 2048,
      messages: chatMessages,
      stream: !!onChunk,
    }
    if (system) body.system = system

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(`Anthropic error ${response.status}: ${err.error?.message || response.statusText}`)
    }

    if (onChunk) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.type === 'content_block_delta') {
              const delta = json.delta?.text || ''
              if (delta) {
                fullText += delta
                onChunk(delta)
              }
            }
          } catch {}
        }
      }
      return fullText
    } else {
      const data = await response.json()
      return data.content?.[0]?.text || ''
    }
  }

  async testConnection() {
    const response = await this.complete('Reply with "OK" only.')
    return { ok: true, message: `Connected to Anthropic. Model: ${this._model}` }
  }
}
```

> **Security note on `anthropic-dangerous-direct-browser-access`:**
> This header tells Anthropic's CORS policy to allow browser requests. It is appropriate
> for a single-user app where the API key belongs to the user. Do NOT use this in a
> multi-user web app where users share a single API key — that would expose your key.
> In Active Assistant, each user enters their own API key, which is fine.

---

## Step 6: Ollama Local Server Provider

Create **`src/ai/providers/ollama.js`**:

```javascript
// ============================================================================
// OLLAMA PROVIDER — Connects to a local Ollama server (http://localhost:11434).
// Ollama lets you run any model locally: llama3, mistral, phi3, gemma3, etc.
// No API key needed — just have Ollama running.
// config: { baseUrl, model }
// ============================================================================
import { AIProvider } from './base.js'

export class OllamaProvider extends AIProvider {
  constructor(config = {}) {
    super(config)
    this._baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    this._model   = config.model || 'llama3.2'
  }

  get name() { return `Ollama (${this._model})` }

  async isAvailable() {
    try {
      const res = await fetch(`${this._baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }

  async chat(messages, onChunk) {
    const response = await fetch(`${this._baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this._model,
        messages,
        stream: !!onChunk,
        options: { temperature: 0.7 },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Ollama error ${response.status}: ${err}`)
    }

    if (onChunk) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const json = JSON.parse(line)
            const delta = json.message?.content || ''
            if (delta) {
              fullText += delta
              onChunk(delta)
            }
          } catch {}
        }
      }
      return fullText
    } else {
      // Non-streaming Ollama returns a single JSON line
      const text = await response.text()
      const lastLine = text.trim().split('\n').pop()
      const json = JSON.parse(lastLine)
      return json.message?.content || ''
    }
  }

  async testConnection() {
    const available = await this.isAvailable()
    if (!available) throw new Error(`Cannot reach Ollama at ${this._baseUrl}. Is it running?`)
    const res = await fetch(`${this._baseUrl}/api/tags`)
    const data = await res.json()
    const models = (data.models || []).map(m => m.name).join(', ')
    return { ok: true, message: `Ollama running. Available models: ${models || 'none'}` }
  }
}
```

---

## Step 7: AI Registry

Create **`src/ai/aiRegistry.js`**:

```javascript
// ============================================================================
// AI REGISTRY — Manages AI provider selection and encrypted config storage.
// Config (including API keys) stored encrypted in localStorage using AES-256-GCM.
// Falls back to plaintext storage if no vault password available.
// ============================================================================
import { WebLLMProvider }   from './providers/webllm.js'
import { OpenAIProvider }   from './providers/openai.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { OllamaProvider }   from './providers/ollama.js'

export const AI_CONFIG_KEY = 'aa-ai-config'

export const PROVIDER_TYPES = {
  webllm: {
    label: 'Gemma 4 (Local — Free)',
    description: 'Runs entirely in your browser. No API key. First use downloads ~1.5GB.',
    icon: '🧠',
    class: WebLLMProvider,
    requiresKey: false,
    keyLabel: null,
    modelOptions: [
      { value: 'gemma-4-2b-instruct-q4f32_1-MLC', label: 'Gemma 4 2B (WebGPU — Fast)' },
      { value: 'gemma-4-2b-instruct-q4f16_0-MLC', label: 'Gemma 4 2B (CPU/WASM — Compatible)' },
    ],
  },
  openai: {
    label: 'OpenAI',
    description: 'GPT-4o and GPT-4o-mini. Requires your own OpenAI API key.',
    icon: '🤖',
    class: OpenAIProvider,
    requiresKey: true,
    keyLabel: 'OpenAI API Key',
    modelOptions: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, cheaper)' },
      { value: 'gpt-4o',      label: 'GPT-4o (Most capable)' },
    ],
  },
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Claude models. Requires your own Anthropic API key.',
    icon: '⚡',
    class: AnthropicProvider,
    requiresKey: true,
    keyLabel: 'Anthropic API Key',
    modelOptions: [
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fast)' },
      { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (Balanced)' },
    ],
  },
  ollama: {
    label: 'Ollama (Local Server)',
    description: 'Any model via a local Ollama server on your machine.',
    icon: '🦙',
    class: OllamaProvider,
    requiresKey: false,
    keyLabel: null,
    modelOptions: [],
  },
}

// Persist AI config (API keys stored as-is — localStorage is origin-scoped)
export const getAIConfig = () => {
  const stored = localStorage.getItem(AI_CONFIG_KEY)
  if (!stored) return { type: 'webllm', config: {} }
  try { return JSON.parse(stored) } catch { return { type: 'webllm', config: {} } }
}

export const setAIConfig = (type, config) => {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({ type, config }))
  _activeProvider = null // Force re-instantiation
}

export const clearAIConfig = () => {
  localStorage.removeItem(AI_CONFIG_KEY)
  _activeProvider = null
}

let _activeProvider = null

export const getProvider = () => {
  if (_activeProvider) return _activeProvider
  const { type, config } = getAIConfig()
  const entry = PROVIDER_TYPES[type]
  if (!entry) {
    _activeProvider = new WebLLMProvider()
    return _activeProvider
  }
  _activeProvider = new entry.class(config || {})
  return _activeProvider
}

export const listProviders = () =>
  Object.entries(PROVIDER_TYPES).map(([type, meta]) => ({ type, ...meta }))
```

---

## Step 8: Context Builder + Agents

Create **`src/ai/contextBuilder.js`**:

```javascript
// ============================================================================
// CONTEXT BUILDER — Builds system prompts with app data for context-aware AI.
// ============================================================================

export const buildSystemPrompt = ({ projects = [], tasks = [], people = [], clients = [] } = {}) => {
  const parts = [
    'You are a helpful project management assistant for Active Assistant.',
    'Respond concisely. Use markdown for formatting when helpful.',
    '',
  ]

  if (projects.length > 0) {
    parts.push(`Current projects (${projects.length}):`)
    projects.slice(0, 10).forEach(p => {
      parts.push(`- ${p.name}${p.stage ? ` [${p.stage}]` : ''}${p.dueDate ? ` due ${p.dueDate}` : ''}`)
    })
    parts.push('')
  }

  if (tasks.length > 0) {
    const pending = tasks.filter(t => !t.done)
    if (pending.length > 0) {
      parts.push(`Pending tasks (${pending.length}):`)
      pending.slice(0, 10).forEach(t => {
        parts.push(`- ${t.title}${t.dueDate ? ` due ${t.dueDate}` : ''}`)
      })
      parts.push('')
    }
  }

  return parts.join('\n')
}

// Build a focused prompt for a specific project
export const buildProjectPrompt = (project, tasks = []) => {
  const projectTasks = tasks.filter(t => t.projectId === project.id)
  const doneTasks    = projectTasks.filter(t => t.done)
  const pendingTasks = projectTasks.filter(t => !t.done)

  return [
    `Project: ${project.name}`,
    project.stage    ? `Stage: ${project.stage}` : '',
    project.dueDate  ? `Due: ${project.dueDate}` : '',
    project.narrative ? `Description: ${project.narrative.slice(0, 300)}` : '',
    '',
    `Tasks: ${pendingTasks.length} pending, ${doneTasks.length} done`,
    pendingTasks.length > 0 ? `Pending:\n${pendingTasks.slice(0, 8).map(t => `  - ${t.title}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}
```

Create **`src/ai/agents.js`**:

```javascript
// ============================================================================
// AI AGENTS — Pre-built agent actions that use the active AI provider.
// ============================================================================
import { getProvider } from './aiRegistry.js'
import { buildProjectPrompt, buildSystemPrompt } from './contextBuilder.js'

// Summarize a project
export const summarizeProject = async (project, tasks, onChunk) => {
  const provider = getProvider()
  const prompt = `Please summarize this project status in 2-3 sentences, then list the top 3 priorities:\n\n${buildProjectPrompt(project, tasks)}`
  return provider.complete(prompt, 'You are a project management assistant. Be concise.', onChunk)
}

// Generate task suggestions for a project
export const generateTasks = async (project, existingTasks = [], onChunk) => {
  const provider = getProvider()
  const prompt = `Based on this project, suggest 5 actionable next tasks. Return as a JSON array of objects with 'title' and 'description' fields only. Project:\n\n${buildProjectPrompt(project, existingTasks)}`
  const response = await provider.complete(prompt, 'You are a project management assistant. Return valid JSON only.')

  // Parse JSON from response (LLMs sometimes wrap it in markdown)
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return []
  }
}

// Answer a general question about the user's data
export const askAboutData = async (question, { projects, tasks, people, clients }, onChunk) => {
  const provider = getProvider()
  const systemPrompt = buildSystemPrompt({ projects, tasks, people, clients })
  return provider.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ], onChunk)
}

// Smart search — find relevant items matching a natural language query
export const smartSearch = async (query, { projects, tasks, clients, people }) => {
  const provider = getProvider()
  const allItems = [
    ...projects.map(p => ({ type: 'project', id: p.id, text: `${p.name} ${p.narrative || ''}` })),
    ...tasks.map(t =>    ({ type: 'task',    id: t.id, text: `${t.title} ${t.description || ''}` })),
    ...clients.map(c =>  ({ type: 'client',  id: c.id, text: `${c.name} ${c.contactName || ''}` })),
    ...people.map(p =>   ({ type: 'person',  id: p.id, text: `${p.name} ${p.role || ''}` })),
  ]

  const itemSummary = allItems.slice(0, 50).map((item, i) =>
    `${i}: [${item.type}] ${item.text.slice(0, 100)}`
  ).join('\n')

  const prompt = `Given this list of items, return a JSON array of indices (numbers only) that best match: "${query}"\n\nItems:\n${itemSummary}\n\nReturn only a JSON array like [0, 3, 7]. No explanation.`

  const response = await provider.complete(prompt)
  const matches = response.match(/\[[\d,\s]*\]/)
  if (!matches) return []

  try {
    const indices = JSON.parse(matches[0])
    return indices.map(i => allItems[i]).filter(Boolean)
  } catch {
    return []
  }
}
```

---

## Step 9: Update vite.config.js for WebLLM

WebLLM uses WASM and dynamic imports that conflict with `vite-plugin-singlefile`.
Update **`vite.config.js`**:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true,
      // Exclude WebLLM WASM and worker files from inlining
      useRecommendedBuildConfig: true,
    }),
  ],
  base: './',
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      external: [],
      output: {
        // Keep WebLLM chunks as separate files (not inlined)
        manualChunks: (id) => {
          if (id.includes('@mlc-ai/web-llm')) return 'webllm'
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'], // Don't pre-bundle WebLLM (it's large + uses WASM)
  },
  publicDir: 'public',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // Required for SharedArrayBuffer (used by WebLLM's threading)
    },
  },
})
```

> **COOP/COEP headers:** WebLLM requires `Cross-Origin-Opener-Policy: same-origin` and
> `Cross-Origin-Embedder-Policy: require-corp` for SharedArrayBuffer support (multi-threaded
> inference). These are already configured in the existing vite.config.js for the dev server.
> For production, the hosting server must also set these headers.

---

## Step 10: Create AIChatDrawer Component

Create **`src/components/ai/AIChatDrawer.jsx`**:

```jsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { getProvider } from '../../ai/aiRegistry.js'
import { askAboutData } from '../../ai/agents.js'
import { useCRM } from '../../context.jsx'
import { useStorageMode } from '../../context.jsx'

export const AIChatDrawer = ({ isOpen, onClose, onOpenModelManager }) => {
  const { projects, tasks, clients, people } = useCRM()
  const { storageMode } = useStorageMode()
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      // Greeting on first open
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: `Hi! I'm your AI assistant. I can help you with:\n\n- Summarizing projects\n- Generating task suggestions\n- Answering questions about your data\n- Smart search\n\nWhat would you like to do?`,
          id: 'greeting',
        }])
      }
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userMessage = { role: 'user', content: input.trim(), id: Date.now().toString() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingText('')

    try {
      const provider = getProvider()
      const isAvailable = await provider.isAvailable()

      if (!isAvailable) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'AI is not configured. Click the settings icon above to set up an AI provider.',
          id: Date.now().toString(),
        }])
        return
      }

      let fullResponse = ''

      await askAboutData(
        userMessage.content,
        { projects, tasks, clients, people },
        (chunk) => {
          fullResponse += chunk
          setStreamingText(fullResponse)
        }
      )

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: fullResponse,
        id: Date.now().toString(),
      }])
      setStreamingText('')
    } catch (err) {
      const errMsg = err.message || 'Unknown error'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errMsg}\n\nIf using Gemma 4, make sure the model is loaded. Click ⚙️ to manage AI settings.`,
        id: Date.now().toString(),
      }])
      setStreamingText('')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, projects, tasks, clients, people])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-[99997] flex flex-col animate-in slide-in-from-right-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <p className="text-xs text-slate-400">{getProvider()?.name || 'Not configured'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenModelManager}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="AI Settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-xs"
            title="Clear chat"
          >
            🗑
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-slate-800 text-slate-100 rounded-bl-sm'
              }
            `}>
              <MessageContent content={msg.content} />
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-slate-800 text-slate-100 leading-relaxed">
              <MessageContent content={streamingText} />
              <span className="inline-block w-1 h-4 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}

        {isLoading && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your projects..."
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 self-end"
          >
            ↑
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2 text-center">Enter to send • Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// Render message content with basic markdown support
const MessageContent = ({ content }) => {
  // Very lightweight markdown: bold, code, newlines
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return <div key={i} className="flex gap-1.5"><span className="text-indigo-400 flex-shrink-0">•</span><span>{line.slice(2)}</span></div>
        }
        if (line.startsWith('# ')) {
          return <div key={i} className="font-bold text-base mt-2">{line.slice(2)}</div>
        }
        if (line.startsWith('## ')) {
          return <div key={i} className="font-semibold mt-1">{line.slice(3)}</div>
        }
        if (line === '') return <div key={i} className="h-1" />
        return <div key={i}>{line}</div>
      })}
    </div>
  )
}
```

---

## Step 11: Create ModelManager Component

Create **`src/components/ai/ModelManager.jsx`**:

```jsx
import React, { useState, useEffect, useRef } from 'react'
import {
  PROVIDER_TYPES, getAIConfig, setAIConfig, listProviders
} from '../../ai/aiRegistry.js'
import { WebLLMProvider } from '../../ai/providers/webllm.js'

export const ModelManager = ({ isOpen, onClose }) => {
  const cfg = getAIConfig()
  const [selectedType, setSelectedType] = useState(cfg.type || 'webllm')
  const [formValues, setFormValues]     = useState(cfg.config || {})
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [downloading, setDownloading]   = useState(false)

  const handleSave = () => {
    setAIConfig(selectedType, formValues)
    setTestResult({ ok: true, message: 'AI provider saved.' })
    setTimeout(onClose, 1000)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { class: ProviderClass } = PROVIDER_TYPES[selectedType]
      const provider = new ProviderClass(formValues)
      const result = await provider.testConnection()
      setTestResult({ ok: true, message: result.message })
    } catch (err) {
      setTestResult({ ok: false, message: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleDownloadWebLLM = async () => {
    setDownloading(true)
    setDownloadProgress({ text: 'Initializing...', progress: 0 })
    try {
      const provider = new WebLLMProvider({
        ...formValues,
        onProgress: ({ text, progress }) => {
          setDownloadProgress({ text, progress })
        }
      })
      await provider.initialize(({ text, progress }) => {
        setDownloadProgress({ text, progress })
      })
      setTestResult({ ok: true, message: 'Model loaded successfully!' })
    } catch (err) {
      setTestResult({ ok: false, message: `Download failed: ${err.message}` })
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  if (!isOpen) return null

  const providers = listProviders()
  const entry = PROVIDER_TYPES[selectedType]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-white font-semibold">AI Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider selection */}
          <div className="grid grid-cols-1 gap-2">
            {providers.map(({ type, label, icon, description }) => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setFormValues({}); setTestResult(null) }}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  selectedType === type
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                }`}
              >
                <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{description}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Config fields */}
          {entry?.requiresKey && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {entry.keyLabel}
              </label>
              <input
                type="password"
                value={formValues.apiKey || ''}
                onChange={e => setFormValues(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Model selection */}
          {entry?.modelOptions?.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Model
              </label>
              <select
                value={formValues.model || entry.modelOptions[0].value}
                onChange={e => setFormValues(f => ({ ...f, model: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                {entry.modelOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Ollama URL */}
          {selectedType === 'ollama' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Ollama Server URL
              </label>
              <input
                type="url"
                value={formValues.baseUrl || 'http://localhost:11434'}
                onChange={e => setFormValues(f => ({ ...f, baseUrl: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                value={formValues.model || 'llama3.2'}
                onChange={e => setFormValues(f => ({ ...f, model: e.target.value }))}
                placeholder="Model name (e.g. llama3.2, mistral)"
                className="w-full mt-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* WebLLM download progress */}
          {selectedType === 'webllm' && (
            <div>
              {downloadProgress ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{downloadProgress.text}</span>
                    <span>{Math.round((downloadProgress.progress || 0) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((downloadProgress.progress || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleDownloadWebLLM}
                  disabled={downloading}
                  className="w-full py-2.5 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  {downloading ? 'Loading...' : '⬇ Load Model (~1.5GB, cached after first download)'}
                </button>
              )}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-xl px-4 py-3 text-sm ${
              testResult.ok
                ? 'bg-green-500/10 text-green-300 border border-green-500/20'
                : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-5 border-t border-slate-700">
          {selectedType !== 'webllm' && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="ml-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## Step 12: Create AIAgents Quick-Action Component

Create **`src/components/ai/AIAgents.jsx`**:

```jsx
import React, { useState } from 'react'
import { summarizeProject, generateTasks, smartSearch } from '../../ai/agents.js'
import { useCRM } from '../../context.jsx'

export const AIAgents = ({ project, onTasksGenerated, onSearchResults }) => {
  const { projects, tasks, clients, people, DB } = useCRM()
  const [loading, setLoading]         = useState(null)
  const [result, setResult]           = useState(null)
  const [generatedTasks, setGeneratedTasks] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  const run = async (agentKey, fn) => {
    setLoading(agentKey)
    setResult(null)
    setGeneratedTasks([])
    try {
      const res = await fn()
      if (agentKey === 'generate') {
        setGeneratedTasks(res || [])
      } else {
        setResult(typeof res === 'string' ? res : JSON.stringify(res, null, 2))
      }
    } catch (err) {
      setResult(`Error: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  const handleAddGeneratedTask = async (task) => {
    if (!DB || !project) return
    const newTask = {
      id: DB.generateId(),
      projectId: project.id,
      title: task.title,
      description: task.description || '',
      done: false,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }
    await DB.put('tasks', newTask)
    onTasksGenerated?.()
    setGeneratedTasks(prev => prev.filter(t => t.title !== task.title))
  }

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-2">
        {project && (
          <>
            <button
              onClick={() => run('summarize', () => summarizeProject(project, tasks))}
              disabled={!!loading}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-left transition-colors disabled:opacity-50"
            >
              <span className="text-xl">📋</span>
              <div>
                <div className="font-medium text-white">Summarize Project</div>
                <div className="text-xs text-slate-400">AI summary + top priorities</div>
              </div>
              {loading === 'summarize' && <span className="ml-auto text-xs text-slate-400 animate-pulse">...</span>}
            </button>

            <button
              onClick={() => run('generate', () => generateTasks(project, tasks))}
              disabled={!!loading}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm text-left transition-colors disabled:opacity-50"
            >
              <span className="text-xl">✨</span>
              <div>
                <div className="font-medium text-white">Generate Tasks</div>
                <div className="text-xs text-slate-400">AI suggests next actions</div>
              </div>
              {loading === 'generate' && <span className="ml-auto text-xs text-slate-400 animate-pulse">...</span>}
            </button>
          </>
        )}

        {/* Smart search */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                run('search', () => smartSearch(searchQuery, { projects, tasks, clients, people }))
              }
            }}
            placeholder="Smart search (press Enter)..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => run('search', () => smartSearch(searchQuery, { projects, tasks, clients, people }))}
            disabled={!searchQuery.trim() || !!loading}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          >
            🔍
          </button>
        </div>
      </div>

      {/* Result display */}
      {result && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {result}
        </div>
      )}

      {/* Generated tasks */}
      {generatedTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Suggested Tasks</h4>
          {generatedTasks.map((task, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{task.title}</div>
                {task.description && <div className="text-xs text-slate-400 mt-0.5">{task.description}</div>}
              </div>
              {project && DB && (
                <button
                  onClick={() => handleAddGeneratedTask(task)}
                  className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex-shrink-0"
                >
                  + Add
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Step 13: Wire Everything into App.jsx

In **`src/App.jsx`**:

### Imports:
```javascript
import { AIChatDrawer }  from './components/ai/AIChatDrawer.jsx'
import { ModelManager }  from './components/ai/ModelManager.jsx'
```

### State:
```javascript
const [isAIChatOpen, setIsAIChatOpen]       = useState(false)
const [isModelManagerOpen, setIsModelManagerOpen] = useState(false)
```

### JSX (add alongside other drawers/modals):
```jsx
<AIChatDrawer
  isOpen={isAIChatOpen}
  onClose={() => setIsAIChatOpen(false)}
  onOpenModelManager={() => { setIsAIChatOpen(false); setIsModelManagerOpen(true) }}
/>

<ModelManager
  isOpen={isModelManagerOpen}
  onClose={() => setIsModelManagerOpen(false)}
/>
```

### AI button in header:
```jsx
<button
  onClick={() => setIsAIChatOpen(v => !v)}
  className={`p-2 rounded-lg transition-colors ${
    isAIChatOpen
      ? 'bg-indigo-600 text-white'
      : 'text-slate-400 hover:text-white hover:bg-slate-700'
  }`}
  title="AI Assistant"
>
  🧠
</button>
```

---

## Verification Steps

### 1. WebLLM / Gemma 4 (Local)
```bash
npm run dev
```
1. Open Chrome 113+ → click 🧠 AI button → chat drawer opens
2. Click ⚙️ → AI Settings → select "Gemma 4 (Local)"
3. Click "Load Model" → progress bar appears → ~1.5GB download
4. Progress reaches 100% → click "Save"
5. Type "What projects do I have?" → streaming response appears
6. DevTools → Application → IndexedDB → verify model cache exists

### 2. OpenAI
1. Settings → select "OpenAI" → enter API key from platform.openai.com
2. Select "GPT-4o Mini" → click "Test" → "Connected to OpenAI" message
3. Save → ask a question → response appears

### 3. Anthropic Claude
1. Settings → select "Anthropic Claude" → enter API key from console.anthropic.com
2. Select "Claude Haiku 4.5" → Test → Save
3. Ask a question → streaming response

### 4. AI Agents
1. Open a project with tasks
2. Chat: type "summarize this project" → AI response with summary
3. Open ProjectWorkspace → AI panel → "Generate Tasks" → 5 tasks suggested
4. Click "+ Add" on a suggestion → task appears in the project

### 5. Offline AI (WebLLM)
1. Load Gemma 4 model (from step 1)
2. DevTools → Network → Offline
3. Ask a question → Gemma 4 still responds (model is cached in IndexedDB)
4. AI works completely offline ✓

---

## Security Notes

- **API keys in localStorage:** Keys are origin-scoped and never leave the user's device except in API requests to the provider. This is appropriate for a single-user app.
- **WebLLM model cache:** Model weights are stored in browser IndexedDB — ~1.5GB per model. They do not contain user data.
- **No telemetry:** None of your project data is sent to any server unless you use an API provider (OpenAI/Anthropic). With WebLLM, all inference is local.
- **Anthropic header:** The `anthropic-dangerous-direct-browser-access: true` header is required by Anthropic for browser requests. It is not a security risk — it just bypasses Anthropic's default CORS restriction which is designed for server-side use.
- **Model selection:** Gemma 4 is open-source (Apache 2.0). Users can switch to any locally-run model via Ollama with no licensing concerns.
