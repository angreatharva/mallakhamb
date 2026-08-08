/**
 * Base Repository Class
 * 
 * Provides common CRUD operations for all domain repositories.
 * Abstracts Mongoose operations and returns plain JavaScript objects.
 * Implements query options support, soft delete, and error handling.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.8, 16.1
 */

class BaseRepository {
  /**
   * Create a base repository
   * @param {mongoose.Model} model - Mongoose model
   * @param {Logger} logger - Logger instance
   */
  constructor(model, logger) {
    if (!model) {
      throw new Error('Model is required for BaseRepository');
    }
    if (!logger) {
      throw new Error('Logger is required for BaseRepository');
    }
    
    this.model = model;
    this.logger = logger;
  }

  /**
   * Create a new document
   * @param {Object} data - Document data
   * @returns {Promise<Object>} Created document as plain object
   */
  async create(data) {
    try {
      let doc;
      if (typeof this.model.create === 'function') {
        doc = await this.model.create(data);
      } else {
        // Backward-compatible fallback used by some legacy tests that mock
        // constructor/save instead of static model.create().
        const instance = new this.model(data);
        doc = await instance.save();
      }
      return this.toPlainObject(doc);
    } catch (error) {
      this.logger.error('Create error', { 
        model: this.model.modelName, 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Find document by ID
   * @param {string} id - Document ID
   * @param {Object} options - Query options (select, populate)
   * @returns {Promise<Object|null>} Document or null
   */
  async findById(id, options = {}) {
    try {
      let query = this.model.findById(id);
      
      // Apply soft delete filter
      if (this.model.schema.paths.isDeleted) {
        query = query.where('isDeleted').ne(true);
      }
      
      if (options.select) {
        query = query.select(options.select);
      }
      
      if (options.populate) {
        query = query.populate(options.populate);
      }
      
      const doc = await this.executeQuery(query);
      return doc;
    } catch (error) {
      this.logger.error('FindById error', { 
        model: this.model.modelName, 
        id, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find one document matching criteria
   * @param {Object} criteria - Query criteria
   * @param {Object} options - Query options (select, populate)
   * @returns {Promise<Object|null>} Document or null
   */
  async findOne(criteria, options = {}) {
    try {
      // Apply soft delete filter
      const queryCriteria = { ...criteria };
      if (this.model.schema.paths.isDeleted) {
        queryCriteria.isDeleted = { $ne: true };
      }
      
      let query = this.model.findOne(queryCriteria);
      
      if (options.select) {
        query = query.select(options.select);
      }
      
      if (options.populate) {
        query = query.populate(options.populate);
      }
      
      const doc = await this.executeQuery(query);
      return doc;
    } catch (error) {
      this.logger.error('FindOne error', { 
        model: this.model.modelName, 
        criteria, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find multiple documents
   * @param {Object} criteria - Query criteria
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of documents
   */
  async find(criteria = {}, options = {}) {
    try {
      // Apply soft delete filter
      const queryCriteria = { ...criteria };
      if (this.model.schema.paths.isDeleted) {
        queryCriteria.isDeleted = { $ne: true };
      }
      
      let query = this.model.find(queryCriteria);
      
      if (options.select) {
        query = query.select(options.select);
      }
      
      if (options.populate) {
        query = query.populate(options.populate);
      }
      
      if (options.sort) {
        query = query.sort(options.sort);
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.skip) {
        query = query.skip(options.skip);
      }
      
      const docs = await this.executeQuery(query);
      return docs;
    } catch (error) {
      this.logger.error('Find error', { 
        model: this.model.modelName, 
        criteria, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update document by ID
   * @param {string} id - Document ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object|null>} Updated document or null
   */
  async updateById(id, updates) {
    try {
      // If password is being updated, use save() to trigger pre-save hooks
      if (updates.password !== undefined) {
        // `password` is `select: false` on the user schemas, so it must be
        // explicitly re-selected or the document loads without it. Harmless on
        // models that have no password path — Mongoose drops unknown `+` paths.
        const doc = await this.model.findById(id).select('+password');
        if (!doc) return null;

        // Use set() so Mongoose tracks changes (Object.assign bypasses change tracking)
        doc.set(updates);
        if (updates.password) {
          doc.markModified('password');
        }

        // Save will trigger pre-save hooks (including password hashing)
        await doc.save();

        // Never hand the (re-selected) hash back to callers.
        const plain = this.toPlainObject(doc);
        if (plain) delete plain.password;
        return plain;
      }
      
      // For non-password updates, use findOneAndUpdate for better performance
      // Build query with soft delete filter if applicable
      const query = { _id: id };
      if (this.model.schema.paths.isDeleted) {
        query.isDeleted = { $ne: true };
      }
      
      // Check if updates contain MongoDB operators (like $push, $pull, $set, etc.)
      const hasOperators = Object.keys(updates).some(key => key.startsWith('$'));
      
      // If updates contain operators, use them directly; otherwise wrap in $set
      const updateQuery = hasOperators ? updates : { $set: updates };
      
      const queryResult = this.model.findOneAndUpdate(
        query,
        updateQuery,
        { new: true, runValidators: true }
      );
      const doc = await this.executeQuery(queryResult);
      return doc;
    } catch (error) {
      this.logger.error('UpdateById error', { 
        model: this.model.modelName, 
        id, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete document by ID (soft delete if supported)
   * @param {string} id - Document ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteById(id) {
    try {
      // Check if model supports soft delete
      if (this.model.schema.paths.isDeleted) {
        await this.model.findByIdAndUpdate(id, { isDeleted: true });
      } else {
        await this.model.findByIdAndDelete(id);
      }
      return true;
    } catch (error) {
      this.logger.error('DeleteById error', { 
        model: this.model.modelName, 
        id, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update every document matching criteria.
   *
   * Added 2026-08-08. Two callers had been using this for a long time —
   * the admin "lock age group" and "unlock age group" paths in the scoring
   * service — but it did not exist on any repository, so both threw
   * `TypeError: this.scoreRepository.updateMany is not a function` and
   * returned 500. Nothing caught it because no test exercised those routes;
   * the integration suite added for task 3.5 found it on its first run.
   *
   * Soft-delete filtered like the read methods, so a bulk update cannot
   * silently resurrect or modify deleted rows.
   *
   * @param {Object} criteria - Query criteria
   * @param {Object} updates - Fields to set
   * @returns {Promise<{matchedCount: number, modifiedCount: number}>}
   */
  async updateMany(criteria = {}, updates = {}) {
    try {
      const queryCriteria = { ...criteria };
      if (this.model.schema.paths.isDeleted) {
        queryCriteria.isDeleted = { $ne: true };
      }

      const result = await this.model.updateMany(queryCriteria, { $set: updates });

      this.logger.debug('Bulk update', {
        model: this.model.modelName,
        matched: result.matchedCount,
        modified: result.modifiedCount,
      });

      return {
        matchedCount: result.matchedCount ?? 0,
        modifiedCount: result.modifiedCount ?? 0,
      };
    } catch (error) {
      this.logger.error('Bulk update error', {
        model: this.model.modelName,
        criteria,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Count documents matching criteria
   * @param {Object} criteria - Query criteria
   * @returns {Promise<number>} Document count
   */
  async count(criteria = {}) {
    try {
      // Apply soft delete filter
      const queryCriteria = { ...criteria };
      if (this.model.schema.paths.isDeleted) {
        queryCriteria.isDeleted = { $ne: true };
      }
      
      return await this.model.countDocuments(queryCriteria);
    } catch (error) {
      this.logger.error('Count error', { 
        model: this.model.modelName, 
        criteria, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if document exists
   * @param {Object} criteria - Query criteria
   * @returns {Promise<boolean>} True if document exists
   */
  async exists(criteria) {
    try {
      // Apply soft delete filter
      const queryCriteria = { ...criteria };
      if (this.model.schema.paths.isDeleted) {
        queryCriteria.isDeleted = { $ne: true };
      }
      
      const doc = await this.model.exists(queryCriteria);
      return !!doc;
    } catch (error) {
      this.logger.error('Exists error', { 
        model: this.model.modelName, 
        criteria, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Convert Mongoose document to plain object
   * @param {Object} doc - Mongoose document
   * @returns {Object|null} Plain JavaScript object
   */
  toPlainObject(doc) {
    if (!doc) return null;
    return doc.toObject ? doc.toObject() : doc;
  }

  /**
   * Execute a mongoose query or handle mock-returned plain values.
   * @param {*} queryOrValue - Mongoose query object or already resolved value
   * @returns {Promise<*>}
   */
  async executeQuery(queryOrValue) {
    if (!queryOrValue) return queryOrValue;
    if (typeof queryOrValue.lean === 'function') {
      return queryOrValue.lean().exec();
    }
    if (typeof queryOrValue.exec === 'function') {
      return queryOrValue.exec();
    }
    return queryOrValue;
  }
}

module.exports = BaseRepository;
