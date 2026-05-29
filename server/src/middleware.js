import jwt from 'jsonwebtoken';
import { User } from './models.js';

export function signToken(user) { return jwt.sign({ id: user._id, role: user.role, farm: user.farm }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }); }
export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated' });
  try { const payload = jwt.verify(token, process.env.JWT_SECRET); req.user = await User.findById(payload.id).select('-passwordHash'); if (!req.user || !req.user.active) throw new Error('invalid'); next(); }
  catch { return res.status(401).json({ message: 'Session expired. Please login again.' }); }
}
export function permit(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions' }); }
export function errorHandler(err, req, res, next) { console.error(err); const message = err.message || 'Server error'; res.status(err.status || 500).json({ error: message, message }); }
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
