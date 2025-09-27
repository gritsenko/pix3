export const sceneJsonSchema = {
  $id: 'https://pix3.dev/schemas/scene.json',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'root'],
  properties: {
    version: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    root: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/node' },
    },
  },
  definitions: {
    node: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      anyOf: [{ required: ['type'] }, { required: ['instance'] }],
      properties: {
        id: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['Node3D', 'Sprite2D', 'Group', 'Instance'] },
        name: { type: 'string', minLength: 1 },
        instance: { type: 'string', pattern: '^res://.+\\.pix3scene$' },
        properties: { type: 'object', additionalProperties: true },
        metadata: { type: 'object', additionalProperties: true },
        children: {
          type: 'array',
          items: { $ref: '#/definitions/node' },
        },
      },
    },
  },
} as const;
