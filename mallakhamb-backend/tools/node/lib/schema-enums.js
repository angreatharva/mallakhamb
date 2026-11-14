'use strict';

/**
 * Walks Mongoose schemas and returns every enum-constrained field.
 *
 * Reads the runtime schema (`schema.paths`), so values that come from a shared
 * constant (`enum: GENDERS`) and values typed inline are seen the same way.
 * Recurses into single nested subdocuments and document arrays.
 */

/** Normalise Mongoose's two `enum` option forms (array, or `{ values, message }`). */
function enumOption(options) {
  if (!options || options.enum === undefined || options.enum === null) return null;
  const raw = Array.isArray(options.enum) ? options.enum : options.enum.values;
  return Array.isArray(raw) && raw.length > 0 ? raw : null;
}

/** The element type of an array path, across Mongoose versions. */
function arrayElementType(schemaType) {
  return schemaType.embeddedSchemaType || schemaType.$embeddedSchemaType || schemaType.caster || null;
}

/**
 * @returns {Array<{path: string, type: string, values: Array<string|number>, nullable: boolean, isArray: boolean}>}
 */
function collectEnumFields(schema, prefix = '') {
  const fields = [];
  schema.eachPath((name, schemaType) => {
    const fullPath = prefix + name;

    if (schemaType.schema) {
      const isArray = schemaType.instance === 'Array' || schemaType.$isMongooseDocumentArray === true;
      fields.push(...collectEnumFields(schemaType.schema, `${fullPath}${isArray ? '[]' : ''}.`));
      return;
    }

    let values = enumOption(schemaType.options);
    let type = schemaType.instance;
    let isArray = false;

    if (!values && schemaType.instance === 'Array') {
      const element = arrayElementType(schemaType);
      values = element ? enumOption(element.options) : null;
      type = element ? element.instance : type;
      isArray = true;
    }
    if (!values) return;

    fields.push({
      path: fullPath,
      type,
      values: values.filter((value) => value !== null),
      nullable: values.includes(null),
      isArray,
    });
  });
  return fields;
}

module.exports = { collectEnumFields };
