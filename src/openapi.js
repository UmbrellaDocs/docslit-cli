import { bundle, createConfig } from '@redocly/openapi-core';
import { applyOverlay } from 'openapi-overlays-js/src/overlay.js';
import fs from 'fs-extra';
import path from 'path';
import { parseWithPointers } from '@stoplight/yaml';

export async function loadSpec(specPath, overlayPath = null) {
  const abs = path.resolve(specPath);
  if (!await fs.pathExists(abs)) {
    throw new Error(`OpenAPI spec not found: ${specPath}`);
  }

  const config = await createConfig({});
  const result = await bundle({ ref: abs, config });

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
    for (const [method, operation] of Object.entries(methods)) {
      if (method.startsWith('x-') || method === 'parameters' || method === 'summary' || method === 'description' || method === 'servers') continue;

      const params = (operation.parameters || []).map(p => ({
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
      }));

      const bodySchema = operation.requestBody?.content?.['application/json']?.schema || null;
      let bodyFields = [];
      if (bodySchema?.properties) {
        const required = new Set(bodySchema.required || []);
        bodyFields = Object.entries(bodySchema.properties).map(([name, prop]) => ({
          name,
          in: 'body',
          required: required.has(name),
          type: prop.type || 'string',
          description: prop.description || '',
          format: prop.format || null,
          enum: prop.enum || null,
          pattern: prop.pattern || null,
          minimum: prop.minimum ?? null,
          maximum: prop.maximum ?? null,
        }));
      }

      endpoints.push({
        operationId: operation.operationId || null,
        method: method.toUpperCase(),
        path: urlPath,
        summary: operation.summary || '',
        description: operation.description || '',
        tags: operation.tags || [],
        parameters: params,
        bodyFields,
        responses: operation.responses || {},
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

      const bodySchema = operation.requestBody?.content?.['application/json']?.schema || null;
      let payloadFields = [];
      if (bodySchema?.properties) {
        const required = new Set(bodySchema.required || []);
        payloadFields = Object.entries(bodySchema.properties).map(([propName, prop]) => ({
          name: propName,
          required: required.has(propName),
          type: prop.type || 'string',
          description: prop.description || '',
        }));
      }

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

export function getSecuritySchemes(spec) {
  return spec.components?.securitySchemes || {};
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

      const existingAttrs = (before + after).trim();
      if (existingAttrs) attrs.push(existingAttrs);

      const allFields = [...op.parameters, ...op.bodyFields];
      let fieldsHtml = '';
      if (allFields.length) {
        const fieldTags = allFields.map(f => {
          const parts = [`name="${escapeAttr(f.name)}"`, `type="${f.type}"`, `in="${f.in}"`];
          if (f.required) parts.push('required');
          if (f.description) parts.push(`description="${escapeAttr(f.description)}"`);
          if (f.format) parts.push(`format="${f.format}"`);
          if (f.enum) parts.push(`enum="${escapeAttr(f.enum.join(', '))}"`);
          if (f.pattern) parts.push(`pattern="${escapeAttr(f.pattern)}"`);
          if (f.minimum !== null) parts.push(`minimum="${f.minimum}"`);
          if (f.maximum !== null) parts.push(`maximum="${f.maximum}"`);
          return `<wc-field ${parts.join(' ')}></wc-field>`;
        });
        fieldsHtml = `\n<wc-fields>${fieldTags.join('\n')}</wc-fields>\n`;
      }

      let examplesHtml = '';
      if (op.examples.length) {
        examplesHtml = op.examples.map(ex =>
          `<wc-code-tab label="${escapeAttr(ex.label)}" language="${ex.lang || ''}">\n${ex.code || ''}</wc-code-tab>`
        ).join('\n');
      }

      const trimmedChildren = children.trim();
      const body = [fieldsHtml, trimmedChildren, examplesHtml].filter(Boolean).join('\n');

      return `<wc-endpoint ${attrs.join(' ')}>${body}\n</wc-endpoint>`;
    }
  );
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
