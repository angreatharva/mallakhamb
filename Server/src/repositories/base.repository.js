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
      const doc = await this.model.create(data);
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
      
      const doc = await query.lean().exec();
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
      
      const doc = await query.lean().exec();
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
      
      const docs = await query.lean().exec();
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
      // Build query with soft delete filter if applicable
      const query = { _id: id };
      if (this.model.schema.paths.isDeleted) {
        query.isDeleted = { $ne: true };
      }
      
      const doc = await this.model.findOneAndUpdate(
        query,
        updates,
        { new: true, runValidators: true }
      ).lean().exec();
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
}

module.exports = BaseRepository;
