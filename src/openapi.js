import { bundle, createConfig } from '@redocly/openapi-core';
import { applyOverlay } from 'openapi-overlays-js/src/overlay.js';
import fs from 'fs-extra';
import path from 'path';
import { parseWithPointers } from '@stoplight/yaml';

function deriveOperationId(method, urlPath) {
  const parts = urlPath.split('/').filter(Boolean).map(p => {
    if (p.startsWith('{') && p.endsWith('}')) return 'By' + p[1].toUpperCase() + p.slice(2, -1);
    return p[0].toUpperCase() + p.slice(1);
  });
  return method.toLowerCase() + parts.join('');
}

export function schemaToFields(schema, { location = 'body', requiredNames = null, maxDepth = 4, _depth = 0 } = {}) {
  if (!schema || _depth > maxDepth) return [];

  const merged = resolveComposition(schema);
  const fields = [];
  const requiredSet = requiredNames
    ? new Set(requiredNames)
    : new Set(merged.required || []);

  if (merged.properties) {
    for (const [name, prop] of Object.entries(merged.properties)) {
      const resolved = resolveComposition(prop);
      const field = {
        name,
        in: location,
        required: requiredSet.has(name),
        type: resolveType(resolved),
        description: stripHtml(resolved.description),
        format: resolved.format || null,
        enum: resolved.enum || null,
        pattern: resolved.pattern || null,
        minimum: resolved.minimum ?? null,
        maximum: resolved.maximum ?? null,
        maxLength: resolved.maxLength ?? null,
        minLength: resolved.minLength ?? null,
        example: resolved.example ?? null,
        default: resolved.default ?? null,
        deprecated: !!resolved.deprecated,
        children: [],
      };

      if (resolved.type === 'object' && resolved.properties) {
        field.children = schemaToFields(resolved, { location, maxDepth, _depth: _depth + 1 });
      } else if (resolved.type === 'array' && resolved.items) {
        const items = resolveComposition(resolved.items);
        if (items.properties) {
          field.children = schemaToFields(items, { location, maxDepth, _depth: _depth + 1 });
        }
      }

      fields.push(field);
    }
  }

  return fields;
}

function resolveComposition(schema) {
  if (!schema) return {};
  const composer = schema.allOf || schema.anyOf || schema.oneOf;
  if (!composer) return schema;

  const merged = { ...schema };
  delete merged.allOf;
  delete merged.anyOf;
  delete merged.oneOf;

  for (const sub of composer) {
    const resolved = resolveComposition(sub);
    if (resolved.properties) {
      merged.properties = { ...(merged.properties || {}), ...resolved.properties };
    }
    if (resolved.required) {
      merged.required = [...(merged.required || []), ...resolved.required];
    }
    if (resolved.type && !merged.type) merged.type = resolved.type;
    if (resolved.description && !merged.description) merged.description = resolved.description;
    if (resolved.format && !merged.format) merged.format = resolved.format;
  }
  return merged;
}

function resolveType(schema) {
  if (schema.type === 'array' && schema.items) {
    const items = resolveComposition(schema.items);
    const itemType = items.type || 'object';
    return `array[${itemType}]`;
  }
  return schema.type || 'string';
}

export async function loadSpec(specPath, overlayPath = null) {
  const abs = path.resolve(specPath);
  if (!await fs.pathExists(abs)) {
    throw new Error(`OpenAPI spec not found: ${specPath}`);
  }

  const config = await createConfig({});
  const result = await bundle({ ref: abs, config, dereference: true });

  if (result.problems.length) {
    const errors = result.problems.filter(p => p.severity === 'error');
    if (errors.length) {
      const msgs = errors.map(p => p.message).join('; ');
      throw new Error(`OpenAPI spec has errors: ${msgs}`);
    }
  }

  let spec = result.bundle.parsed;

  if (overlayPath) {
    const overlayAbs = path.resolve(overlayPath);
    if (!await fs.pathExists(overlayAbs)) {
      throw new Error(`OpenAPI overlay not found: ${overlayPath}`);
    }
    const overlayRaw = await fs.readFile(overlayAbs, 'utf8');
    const overlay = parseWithPointers(overlayRaw).data;
    spec = applyOverlay(spec, overlay);
  }

  return spec;
}

export function getEndpoints(spec) {
  const endpoints = [];
  const paths = spec.paths || {};

  for (const [urlPath, methods] of Object.entries(paths)) {
    const pathLevelParams = Array.isArray(methods.parameters) ? methods.parameters : [];

    for (const [method, operation] of Object.entries(methods)) {
      if (method.startsWith('x-') || method === 'parameters' || method === 'summary' || method === 'description' || method === 'servers') continue;

      const opParams = operation.parameters || [];
      const mergedRaw = [...pathLevelParams];
      for (const op of opParams) {
        const idx = mergedRaw.findIndex(p => p.name === op.name && p.in === op.in);
        if (idx >= 0) mergedRaw[idx] = op;
        else mergedRaw.push(op);
      }

      const params = mergedRaw.map(p => ({
        name: p.name,
        in: p.in,
        required: !!p.required,
        type: p.schema?.type || 'string',
        description: stripHtml(p.description),
        format: p.schema?.format || null,
        enum: p.schema?.enum || null,
        pattern: p.schema?.pattern || null,
        minimum: p.schema?.minimum ?? null,
        maximum: p.schema?.maximum ?? null,
        maxLength: p.schema?.maxLength ?? null,
        minLength: p.schema?.minLength ?? null,
        example: p.schema?.example ?? p.example ?? null,
        default: p.schema?.default ?? null,
        deprecated: !!p.deprecated,
      }));

      const bodyContent = operation.requestBody?.content || {};
      const requestBodyContentType = Object.keys(bodyContent)[0] || null;
      const bodySchema = requestBodyContentType ? bodyContent[requestBodyContentType]?.schema : null;
      const bodyFields = bodySchema ? schemaToFields(bodySchema, { location: 'body' }) : [];

      endpoints.push({
        operationId: operation.operationId || deriveOperationId(method.toUpperCase(), urlPath),
        method: method.toUpperCase(),
        path: urlPath,
        summary: operation.summary || '',
        description: stripHtml(operation.description),
        tags: operation.tags || [],
        parameters: params,
        bodyFields,
        requestBodyContentType,
        responses: Object.entries(operation.responses || {}).map(([code, resp]) => {
          const content = Object.entries(resp.content || {}).map(([mediaType, media]) => ({
            mediaType,
            schema: media.schema || null,
            examples: media.examples
              ? Object.entries(media.examples).map(([name, ex]) => ({
                  name, summary: ex.summary || name, value: ex.value
                }))
              : media.example
                ? [{ name: 'default', summary: 'Example', value: media.example }]
                : []
          }));
          const primarySchema = content[0]?.schema || null;
          return {
            code,
            description: stripHtml(resp.description),
            content,
            fields: primarySchema ? schemaToFields(primarySchema, { location: 'response' }) : [],
          };
        }),
        security: operation.security || null,
        requestBodyExamples: Object.entries(operation.requestBody?.content || {}).map(([mediaType, media]) => ({
          mediaType,
          examples: media.examples
            ? Object.entries(media.examples).map(([name, ex]) => ({ name, summary: ex.summary || name, value: ex.value }))
            : media.example ? [{ name: 'default', summary: 'Example', value: media.example }] : []
        })),
        examples: operation['x-docslit-examples'] || [],
      });
    }
  }

  return endpoints;
}

export function getOperation(spec, operationId) {
  const endpoints = getEndpoints(spec);
  return endpoints.find(e => e.operationId === operationId) || null;
}

export function getWebhooks(spec) {
  const webhooks = [];
  const hooks = spec.webhooks || {};

  for (const [name, methods] of Object.entries(hooks)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method.startsWith('x-') || method === 'parameters' || method === 'summary' || method === 'description') continue;

      const webhookContent = operation.requestBody?.content || {};
      const webhookContentType = Object.keys(webhookContent)[0] || 'application/json';
      const bodySchema = webhookContent[webhookContentType]?.schema || null;
      const payloadFields = bodySchema ? schemaToFields(bodySchema) : [];

      webhooks.push({
        name,
        method: method.toUpperCase(),
        summary: operation.summary || '',
        description: stripHtml(operation.description),
        payloadFields,
      });
    }
  }

  return webhooks;
}

export function getApiMeta(spec) {
  const tags = (spec.tags || []).map(t => ({
    name: t.name,
    displayName: t['x-displayName'] || t.name,
    description: stripHtml(t.description),
  }));
  const tagGroups = (spec['x-tagGroups'] || []).map(g => ({
    name: g.name,
    tags: g.tags || [],
  }));
  return { tags, tagGroups };
}

export function getSecuritySchemes(spec) {
  return spec.components?.securitySchemes || {};
}

export function getSpecSecurity(spec) {
  return spec.security || [];
}

export function getUndocumentedOps(spec, pageRefs) {
  const refSet = new Set(pageRefs);
  const endpoints = getEndpoints(spec);
  return endpoints
    .filter(e => e.operationId && !refSet.has(e.operationId))
    .map(e => e.operationId);
}

export function resolveSpecRefs(html, specData) {
  const endpoints = Array.isArray(specData) ? specData : getEndpoints(specData);

  return html.replace(
    /<wc-endpoint\s([^>]*?)ref="([^"]+)"([^>]*?)>([\s\S]*?)<\/wc-endpoint>/g,
    (match, before, ref, after, children) => {
      const op = endpoints.find(e => e.operationId === ref);
      if (!op) return match;

      const attrs = [`ref="${ref}"`, `method="${op.method}"`, `url="${op.path}"`];
      if (op.summary) attrs.push(`summary="${escapeAttr(op.summary)}"`);
      if (op.description) attrs.push(`description="${escapeAttr(op.description)}"`);
      if (op.security) attrs.push(`security="${escapeAttr(JSON.stringify(op.security))}"`);

      const existingAttrs = (before + after).trim();
      if (existingAttrs) attrs.push(existingAttrs);

      const allFields = [...op.parameters, ...op.bodyFields];
      let fieldsHtml = '';
      if (allFields.length) {
        const groups = [
          { key: 'header', title: 'Headers' },
          { key: 'path', title: 'Path Parameters' },
          { key: 'query', title: 'Query Parameters' },
          { key: 'cookie', title: 'Cookie Parameters' },
          { key: 'body', title: op.requestBodyContentType ? `Body ${op.requestBodyContentType}` : 'Body' },
        ];

        const blocks = [];
        for (const g of groups) {
          const fields = allFields.filter(f => f.in === g.key && f.name);
          if (!fields.length) continue;
          const tags = fields.map(f => buildFieldHtml(f));
          blocks.push(`<wc-fields title="${escapeAttr(g.title)}">${tags.join('\n')}</wc-fields>`);
        }
        fieldsHtml = blocks.length ? '\n' + blocks.join('\n') + '\n' : '';
      }

      let responsesHtml = '';
      if (op.responses.length) {
        const responseTags = op.responses.map(r => {
          const parts = [`code="${escapeAttr(r.code)}"`, `description="${escapeAttr(r.description)}"`];
          if (r.content.length && r.content[0].mediaType) {
            parts.push(`content-type="${escapeAttr(r.content[0].mediaType)}"`);
          }
          return `<wc-response ${parts.join(' ')}></wc-response>`;
        });
        responsesHtml = `\n<wc-responses>${responseTags.join('\n')}</wc-responses>\n`;
      }

      let responseFieldsHtml = '';
      const successResponse = op.responses.find(r => r.code.startsWith('2'));
      if (successResponse?.fields?.length) {
        const mediaType = successResponse.content[0]?.mediaType || '';
        const title = mediaType ? `Response body ${mediaType}` : 'Response body';
        const tags = successResponse.fields.map(f => buildFieldHtml(f));
        responseFieldsHtml = `\n<wc-response-fields title="${escapeAttr(title)}">${tags.join('\n')}</wc-response-fields>\n`;
      }

      let examplesHtml = '';
      if (op.examples.length) {
        examplesHtml = op.examples.map(ex =>
          `<wc-code-tab label="${escapeAttr(ex.label)}" language="${ex.lang || ''}">\n${ex.code || ''}</wc-code-tab>`
        ).join('\n');
      }

      const trimmedChildren = children.trim();
      const body = [fieldsHtml, responsesHtml, responseFieldsHtml, trimmedChildren, examplesHtml].filter(Boolean).join('\n');

      let examplePanelHtml = '';
      const hasResponseExamples = op.responses.some(r => r.content.some(c => c.examples.length));
      const hasRequestExamples = op.requestBodyExamples?.some(rb => rb.examples.length);
      if (hasResponseExamples || hasRequestExamples) {
        const exData = {
          responses: op.responses.filter(r => r.content.some(c => c.examples.length)),
          requestBody: (op.requestBodyExamples || []).filter(rb => rb.examples.length),
        };
        examplePanelHtml = `\n<wc-api-examples ref="${ref}" method="${op.method}" url="${escapeAttr(op.path)}" data="${escapeAttr(JSON.stringify(exData))}"></wc-api-examples>`;
      }

      let playgroundHtml = '';
      const playgroundParams = [...op.parameters, ...op.bodyFields.map(f => ({ ...f, in: 'body' }))];
      const paramsJson = playgroundParams.length ? escapeAttr(JSON.stringify(playgroundParams.map(p => ({ name: p.name, in: p.in, type: p.type || 'string', required: !!p.required })))) : '';
      const authAttr = op.security ? ` auth="${escapeAttr(JSON.stringify(op.security))}"` : '';
      playgroundHtml = `\n<wc-playground method="${op.method}" url="${escapeAttr(op.path)}"${paramsJson ? ` params="${paramsJson}"` : ''}${authAttr}></wc-playground>`;

      return `<wc-endpoint ${attrs.join(' ')}>${body}\n</wc-endpoint>${examplePanelHtml}${playgroundHtml}`;
    }
  );
}

function buildFieldHtml(f) {
  const parts = [`name="${escapeAttr(f.name)}"`, `type="${f.type || 'string'}"`];
  if (f.in) parts.push(`in="${f.in}"`);
  if (f.required) parts.push('required');
  if (f.deprecated) parts.push('deprecated');
  if (f.description) parts.push(`description="${escapeAttr(f.description)}"`);
  if (f.format) parts.push(`format="${f.format}"`);
  if (f.enum) parts.push(`enum="${escapeAttr(f.enum.join(', '))}"`);
  if (f.pattern) parts.push(`pattern="${escapeAttr(f.pattern)}"`);
  if (f.minimum !== null) parts.push(`minimum="${f.minimum}"`);
  if (f.maximum !== null) parts.push(`maximum="${f.maximum}"`);
  if (f.maxLength !== null) parts.push(`maxlength="${f.maxLength}"`);
  if (f.minLength !== null) parts.push(`minlength="${f.minLength}"`);
  if (f.example !== null && f.example !== undefined) parts.push(`example="${escapeAttr(String(f.example))}"`);
  if (f.default !== null && f.default !== undefined) parts.push(`default="${escapeAttr(String(f.default))}"`);

  if (f.children?.length) {
    parts.push('collapsible');
    const childHtml = f.children.map(c => buildFieldHtml(c)).join('\n');
    return `<wc-field ${parts.join(' ')}>\n${childHtml}\n</wc-field>`;
  }
  return `<wc-field ${parts.join(' ')}></wc-field>`;
}

export function endpointToMarkdown(op) {
  if (!op) return '';
  const lines = [];

  lines.push(`## ${op.method} ${op.path}\n`);
  if (op.summary) lines.push(`${op.summary}\n`);
  if (op.description) lines.push(`${op.description}\n`);

  const paramGroups = [
    { key: 'header', title: 'Headers' },
    { key: 'path', title: 'Path Parameters' },
    { key: 'query', title: 'Query Parameters' },
    { key: 'cookie', title: 'Cookie Parameters' },
  ];
  for (const g of paramGroups) {
    const fields = op.parameters.filter(f => f.in === g.key);
    if (!fields.length) continue;
    lines.push(`### ${g.title}\n`);
    lines.push(fieldsToMarkdownTable(fields));
  }

  if (op.bodyFields.length) {
    const title = op.requestBodyContentType ? `Request Body (${op.requestBodyContentType})` : 'Request Body';
    lines.push(`### ${title}\n`);
    lines.push(fieldsToMarkdown(op.bodyFields, 0));
  }

  if (op.responses.length) {
    lines.push(`### Responses\n`);
    for (const r of op.responses) {
      const ct = r.content[0]?.mediaType || '';
      lines.push(`#### ${r.code} ${r.description}${ct ? ` (${ct})` : ''}\n`);
      if (r.fields?.length) {
        lines.push(fieldsToMarkdown(r.fields, 0));
      }
      for (const c of r.content) {
        for (const ex of c.examples) {
          if (ex.value !== undefined) {
            lines.push(`**Example${ex.summary && ex.summary !== 'Example' ? ` — ${ex.summary}` : ''}:**\n`);
            lines.push('```json');
            lines.push(typeof ex.value === 'string' ? ex.value : JSON.stringify(ex.value, null, 2));
            lines.push('```\n');
          }
        }
      }
    }
  }

  return lines.join('\n');
}

function fieldsToMarkdownTable(fields) {
  const lines = ['| Name | Type | Required | Description |', '|---|---|---|---|'];
  for (const f of fields) {
    const type = f.format ? `${f.type} (${f.format})` : f.type;
    const req = f.required ? 'Yes' : 'No';
    const desc = buildFieldDesc(f);
    lines.push(`| \`${f.name}\` | ${type} | ${req} | ${desc} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function fieldsToMarkdown(fields, depth) {
  const lines = [];
  const indent = '  '.repeat(depth);
  for (const f of fields) {
    const type = f.format ? `${f.type} (${f.format})` : f.type;
    const req = f.required ? ' **required**' : '';
    lines.push(`${indent}- \`${f.name}\` *${type}*${req}${f.description ? ` — ${f.description}` : ''}`);

    const extras = [];
    if (f.enum) extras.push(`Enum: ${f.enum.join(', ')}`);
    if (f.default !== null && f.default !== undefined) extras.push(`Default: \`${f.default}\``);
    if (f.example !== null && f.example !== undefined) extras.push(`Example: \`${f.example}\``);
    if (f.maxLength !== null) extras.push(`Max length: ${f.maxLength}`);
    if (f.minLength !== null) extras.push(`Min length: ${f.minLength}`);
    if (f.minimum !== null && f.maximum !== null) extras.push(`Range: ${f.minimum}–${f.maximum}`);
    else if (f.minimum !== null) extras.push(`Min: ${f.minimum}`);
    else if (f.maximum !== null) extras.push(`Max: ${f.maximum}`);
    if (extras.length) lines.push(`${indent}  ${extras.join(' · ')}`);

    if (f.children?.length) {
      lines.push(fieldsToMarkdown(f.children, depth + 1));
    }
  }
  lines.push('');
  return lines.join('\n');
}

function buildFieldDesc(f) {
  const parts = [f.description || ''];
  if (f.enum) parts.push(`Enum: ${f.enum.join(', ')}`);
  if (f.default !== null && f.default !== undefined) parts.push(`Default: \`${f.default}\``);
  if (f.example !== null && f.example !== undefined) parts.push(`Example: \`${f.example}\``);
  return parts.filter(Boolean).join('. ').replace(/\|/g, '\\|');
}

export function buildApiPageMarkdown(raw, specData) {
  const refRe = /<wc-endpoint\s[^>]*ref="([^"]+)"[^>]*>[\s\S]*?<\/wc-endpoint>/g;
  const endpoints = Array.isArray(specData) ? specData : getEndpoints(specData);
  const refs = [];
  let m;
  while ((m = refRe.exec(raw)) !== null) refs.push(m[1]);
  if (!refs.length) return raw;

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? fmMatch[2] : raw;

  const parts = [];
  if (frontmatter) parts.push(`---\n${frontmatter}\n---\n`);

  const titleMatch = body.match(/^#\s+(.+)/m);
  if (titleMatch) parts.push(`# ${titleMatch[1]}\n`);

  for (const ref of refs) {
    const op = endpoints.find(e => e.operationId === ref);
    if (op) parts.push(endpointToMarkdown(op));
  }

  return parts.join('\n');
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]+>/g, '').trim();
}
