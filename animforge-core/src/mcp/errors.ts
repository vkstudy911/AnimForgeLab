import { z } from 'zod';

export type McpErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_ID'
  | 'PATH_VIOLATION'
  | 'NOT_FOUND'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFLICT'
  | 'UNSUPPORTED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'EXECUTION_FAILED';

export class McpToolError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function classifyMcpError(err: unknown): {
  code: McpErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (err instanceof McpToolError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    };
  }
  if (err instanceof z.ZodError) {
    return {
      code: 'INVALID_INPUT',
      message: err.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; '),
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/^Invalid (?:project|scene|character|asset|action|job|[a-z]+) id\b/i.test(message)) {
    return { code: 'INVALID_ID', message };
  }
  if (/(?:jail|symlink|traversal|approved|hidden|absolute|null byte|unsupported file)/i.test(message)) {
    return { code: 'PATH_VIOLATION', message };
  }
  if (/not found/i.test(message)) {
    return { code: 'NOT_FOUND', message };
  }
  if (/cancel/i.test(message)) {
    return { code: 'CANCELLED', message };
  }
  if (/timed?\s*out/i.test(message)) {
    return { code: 'TIMEOUT', message };
  }
  return { code: 'EXECUTION_FAILED', message };
}

export function toToolSuccessResult<T extends Record<string, unknown>>(payload: T): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: T;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function toToolErrorResult(err: unknown): {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
} {
  const classified = classifyMcpError(err);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: false,
            code: classified.code,
            error: classified.message,
            ...(classified.details ? { details: classified.details } : {}),
          },
          null,
          2
        ),
      },
    ],
  };
}
