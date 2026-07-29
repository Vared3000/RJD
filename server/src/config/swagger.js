import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Workwear ERP API',
      version: '0.1.0',
      description: 'ERP-система учёта аренды спецодежды — REST API',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/**/*.routes.js'],
});

// Справочники (см. reference-openapi.js) не описываются статичным JSDoc —
// их пути генерируются и добавляются сюда при регистрации роутера в app.js.
export function extendSwaggerPaths(paths) {
  Object.assign(swaggerSpec.paths, paths);
}
