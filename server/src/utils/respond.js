export function success(res, data, statusCode = 200, meta) {
  return res.status(statusCode).json(meta ? { data, meta } : { data });
}
