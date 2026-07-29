export function validateBody(schema) {
  return (req, _res, next) => {
    req.validatedBody = schema.parse(req.body);
    next();
  };
}
