/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data softDelete, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';

/**
 * Menambahkan penanda penghapusan lunak dan middleware query. Secara bawaan query menyembunyikan data yang dihapus kecuali pemanggil secara eksplisit meminta includeDeleted.
 */
export function applySoftDelete(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  });

    /**
   * Menyaring dokumen isDeleted dari query Mongoose biasa sambil tetap mengizinkan akses historis yang secara eksplisit memakai includeDeleted.
   */
  const hideDeleted = function hideDeleted(next) {
    const query = this.getQuery();
    if (query?.includeDeleted === true) {
      delete query.includeDeleted;
      this.setQuery(query);
      next();
      return;
    }

    if (query?.isDeleted === undefined) {
      this.setQuery({ ...query, isDeleted: { $ne: true } });
    }
    next();
  };

  schema.pre('find', hideDeleted);
  schema.pre('findOne', hideDeleted);
  schema.pre('findOneAndUpdate', hideDeleted);
  schema.pre('countDocuments', hideDeleted);
  schema.pre('exists', hideDeleted);
}
