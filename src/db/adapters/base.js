export class BaseAdapter {
  constructor(config) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — extend it, do not instantiate directly.')
    }
    this.config = config
  }

  generateId() {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  async getAll(collection) {
    throw new Error(`${this.constructor.name}.getAll() not implemented`)
  }

  async getById(collection, id) {
    throw new Error(`${this.constructor.name}.getById() not implemented`)
  }

  async put(collection, data) {
    throw new Error(`${this.constructor.name}.put() not implemented`)
  }

  async delete(collection, id) {
    throw new Error(`${this.constructor.name}.delete() not implemented`)
  }

  async testConnection() {
    throw new Error(`${this.constructor.name}.testConnection() not implemented`)
  }
}
