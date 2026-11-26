/**
 * Menangani permintaan dan respons HTTP untuk fitur bootstrap. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { getBootstrap } from '../services/bootstrap.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const bootstrap = asyncHandler(async (req, res) => {
  const data = await getBootstrap({ userId: req.authUser._id, role: req.authUser.role });
  res.json({ success: true, data });
});
