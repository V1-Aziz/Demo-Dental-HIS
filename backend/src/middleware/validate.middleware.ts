import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../utils/response.util';

// Validation middleware factory. Parses `req.body` through the provided Zod
// schema. On success the body is REPLACED with the parsed result (so fields
// stripped by the schema are gone and downstream code gets inferred types).
// On failure all Zod error messages are joined into a single 400 response.
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      badRequest(res, result.error.errors.map(e => e.message).join(', '));
      return;
    }
    req.body = result.data;
    next();
  };
}
