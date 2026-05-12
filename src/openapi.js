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
        description: resolved.description || '',
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
        description: p.description || '',
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
        description: operation.description || '',
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
            description: resp.description || '',
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
        description: operation.description || '',
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
    description: t.description || '',
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

      return `<wc-endpoint ${attrs.join(' ')}>${body}\n</wc-endpoint>${examplePanelHtml}`;
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

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
