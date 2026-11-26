/**
 * Menangani permintaan dan respons HTTP untuk fitur notifikasi. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound } from '../utils/AppError.js';

/**
 * Membatasi dokumen notifikasi menjadi field publik untuk card Notifikasi, termasuk status belum dibaca tanpa mengirim detail internal database.
 */
const map = (n) => ({ id: String(n._id), title: n.title, message: n.message, tone: n.tone, createdAt: n.createdAt, unread: !n.readAt });

export const list = asyncHandler(async (req, res) => {
  const filter = { recipientUserId: req.auth.sub, expiresAt: { $gt: new Date() } };
  if (req.auth.role === 'admin') filter.type = { $not: /^stock\./ };
  const items = await Notification.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: items.map(map) });
});

export const read = asyncHandler(async (req, res, next) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipientUserId: req.auth.sub }, { $set: { readAt: new Date() } }, { new: true }).lean();
  if (!n) return next(notFound('Notifikasi tidak ditemukan.'));
  res.json({ success: true, data: map(n) });
});

export const readAll = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipientUserId: req.auth.sub, readAt: null, expiresAt: { $gt: new Date() } }, { $set: { readAt: new Date() } });
  res.json({ success: true, data: null });
});
