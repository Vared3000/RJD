export function success(res, data, statusCode = 200, meta) {
  return res.status(statusCode).json(meta ? { data, meta } : { data });
}

export function paginatedSuccess(res, items, total, limit, page = 1, extraMeta = {}) {
  const totalPages = Math.ceil(total / limit);
  const meta = {
    total,
    pages: totalPages,
    page,
    limit,
    ...extraMeta,
  };
  return success(res, items, 200, meta);
}
