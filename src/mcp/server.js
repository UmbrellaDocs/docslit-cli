/**
 * Minimal Model Context Protocol server core (JSON-RPC 2.0, newline-delimited
 * over stdio). No SDK dependency. Transport streams are injectable for tests.
 *
 *   const server = createMcpServer({ name, version, instructions, tools, resources, prompts });
 *   await server.serve({ input, output, log });   // resolves when input ends
 *   await server.handle(message)                  // one JSON-RPC message -> response | null
 *
 * tools:     [{ name, title?, description, inputSchema, annotations?, handler(args, ctx) }]
 *            handler returns a string or any JSON value (pretty-printed), or
 *            { text, isError } / { content: [...] , isError }. Throw ToolError for
 *            expected failures (reported as isError results, not protocol errors).
 * resources: { list(): Promise<[{uri,name,description?,mimeType?}]>, read(uri): Promise<{text,mimeType?}|null> }
 * prompts:   [{ name, description, arguments?: [{name,description,required}], get(args) -> { description?, messages } }]
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ResourceNotFound: -32002,
};

export class ToolError extends Error {}

export class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/** Tiny JSON Schema subset validator: type, required, enum, properties, items. Returns error strings. */
export function validateArgs(schema, value, at = 'arguments') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === t || (schema.type === 'number' && t === 'integer') || (schema.type === 'object' && t === 'object');
    if (!ok) return [`${at} must be of type ${schema.type} (got ${t})`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at} must be one of: ${schema.enum.join(', ')}`);
  if (schema.type === 'object' && value && typeof value === 'object') {
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push(`missing required argument "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) errors.push(...validateArgs(sub, value[key], `"${key}"`));
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...validateArgs(schema.items, v, `${at}[${i}]`)));
  }
  return errors;
}

function toContent(result) {
  if (result && typeof result === 'object' && Array.isArray(result.content)) return result;
  if (result && typeof result === 'object' && typeof result.text === 'string') {
    return { content: [{ type: 'text', text: result.text }], ...(result.isError ? { isError: true } : {}) };
  }
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: 'text', text: text ?? '' }] };
}

export function createMcpServer({
  name,
  version = '1.0.0',
  title,
  instructions,
  tools = [],
  resources = null,
  prompts = [],
  log = () => {},
} = {}) {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const promptMap = new Map(prompts.map((p) => [p.name, p]));
  const state = { initialized: false, protocolVersion: null, clientInfo: null };

  const capabilities = {};
  if (tools.length) capabilities.tools = { listChanged: false };
  if (resources) capabilities.resources = { subscribe: false, listChanged: false };
  if (prompts.length) capabilities.prompts = { listChanged: false };

  const publicTool = ({ handler, ...rest }) => rest;

  async function dispatch(method, params, ctx) {
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
        state.protocolVersion = protocolVersion;
        state.clientInfo = params?.clientInfo || null;
        const serverInfo = { name, version, ...(title ? { title } : {}) };
        return { protocolVersion, capabilities, serverInfo, ...(instructions ? { instructions } : {}) };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: tools.map(publicTool) };
      case 'tools/call': {
        const tool = toolMap.get(params?.name);
        if (!tool) throw new RpcError(ErrorCodes.InvalidParams, `Unknown tool: ${params?.name}`);
        const args = params.arguments ?? {};
        if (typeof args !== 'object' || Array.isArray(args)) throw new RpcError(ErrorCodes.InvalidParams, 'arguments must be an object');
        const problems = validateArgs(tool.inputSchema, args);
        if (problems.length) {
          return { content: [{ type: 'text', text: `Invalid arguments for ${tool.name}: ${problems.join('; ')}` }], isError: true };
        }
        try {
          return toContent(await tool.handler(args, ctx));
        } catch (e) {
          if (!(e instanceof ToolError)) log(`tool ${tool.name} failed: ${e?.stack || e}`);
          const msg = e instanceof ToolError ? e.message : `Internal error in ${tool.name}: ${e?.message || e}`;
          return { content: [{ type: 'text', text: msg }], isError: true };
        }
      }
      case 'resources/list': {
        if (!resources) break;
        return { resources: await resources.list() };
      }
      case 'resources/templates/list': {
        if (!resources) break;
        return { resourceTemplates: resources.templates ? await resources.templates() : [] };
      }
      case 'resources/read': {
        if (!resources) break;
        const uri = params?.uri;
        if (typeof uri !== 'string') throw new RpcError(ErrorCodes.InvalidParams, 'uri is required');
        const found = await resources.read(uri);
        if (!found) throw new RpcError(ErrorCodes.ResourceNotFound, `Resource not found: ${uri}`, { uri });
        return { contents: [{ uri, mimeType: found.mimeType || 'text/markdown', text: found.text }] };
      }
      case 'prompts/list': {
        if (!prompts.length) break;
        return { prompts: prompts.map(({ get, ...rest }) => rest) };
      }
      case 'prompts/get': {
        if (!prompts.length) break;
        const p = promptMap.get(params?.name);
        if (!p) throw new RpcError(ErrorCodes.InvalidParams, `Unknown prompt: ${params?.name}`);
        const args = params.arguments || {};
        for (const a of p.arguments || []) {
          if (a.required && (args[a.name] === undefined || args[a.name] === '')) {
            throw new RpcError(ErrorCodes.InvalidParams, `Missing required prompt argument: ${a.name}`);
          }
        }
        return await p.get(args);
      }
      case 'logging/setLevel':
        return {};
      default:
        break;
    }
    throw new RpcError(ErrorCodes.MethodNotFound, `Method not found: ${method}`);
  }

  /** Handle one parsed JSON-RPC message. Returns a response object or null (notification / response). */
  async function handle(msg, ctx = {}) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: msg && typeof msg === 'object' && 'id' in msg ? msg.id : null, error: { code: ErrorCodes.InvalidRequest, message: 'Invalid Request' } };
    }
    const hasId = Object.prototype.hasOwnProperty.call(msg, 'id') && msg.id !== undefined;
    if (typeof msg.method !== 'string') {
      // A response from the client (we send no requests) or garbage.
      if (hasId && ('result' in msg || 'error' in msg)) return null;
      return { jsonrpc: '2.0', id: hasId ? msg.id : null, error: { code: ErrorCodes.InvalidRequest, message: 'Invalid Request: method must be a string' } };
    }
    if (!hasId) {
      // Notification: never respond.
      if (msg.method === 'notifications/initialized') state.initialized = true;
      return null;
    }
    try {
      const result = await dispatch(msg.method, msg.params, ctx);
      return { jsonrpc: '2.0', id: msg.id, result };
    } catch (e) {
      if (e instanceof RpcError) {
        return { jsonrpc: '2.0', id: msg.id, error: { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) } };
      }
      log(`internal error handling ${msg.method}: ${e?.stack || e}`);
      return { jsonrpc: '2.0', id: msg.id, error: { code: ErrorCodes.InternalError, message: `Internal error: ${e?.message || e}` } };
    }
  }

  /** Handle a raw line of input; returns the string to write (or null). */
  async function handleLine(line) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: ErrorCodes.ParseError, message: 'Parse error' } });
    }
    if (Array.isArray(parsed)) {
      if (!parsed.length) return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: ErrorCodes.InvalidRequest, message: 'Invalid Request: empty batch' } });
      const out = (await Promise.all(parsed.map((m) => handle(m)))).filter(Boolean);
      return out.length ? JSON.stringify(out) : null;
    }
    const res = await handle(parsed);
    return res ? JSON.stringify(res) : null;
  }

  /**
   * Serve newline-delimited JSON-RPC from `input` to `output`. Resolves after
   * the input ends and every in-flight request has been answered.
   */
  function serve({ input, output, log: logFn } = {}) {
    if (logFn) log = logFn;
    return new Promise((resolve) => {
      let buf = '';
      const pending = new Set();
      let ended = false;
      let chain = Promise.resolve();
      const finish = () => { if (ended && pending.size === 0) resolve(); };
      const processLine = (line) => {
        line = line.replace(/\r$/, '');
        if (!line.trim()) return;
        // Sequential: messages are handled in arrival order so a pipelined
        // create_page -> read_page script behaves deterministically.
        const p = chain.then(() => handleLine(line))
          .then((out) => { if (out !== null) output.write(out + '\n'); })
          .catch((e) => log(`fatal handler error: ${e?.stack || e}`))
          .finally(() => { pending.delete(p); finish(); });
        chain = p.catch(() => {});
        pending.add(p);
      };
      input.setEncoding?.('utf8');
      input.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          processLine(line);
        }
      });
      input.on('end', () => {
        if (buf.trim()) processLine(buf);
        buf = '';
        ended = true;
        finish();
      });
      input.on('error', (e) => { log(`input error: ${e?.message || e}`); ended = true; finish(); });
    });
  }

  return { handle, handleLine, serve, state, capabilities };
}
