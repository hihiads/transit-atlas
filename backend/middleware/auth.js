import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Niste prijavljeni' });
  }
  try {
    const user = await User.findById(req.session.userId).select('sessionVersion');
    if (!user || user.sessionVersion !== (req.session.sessionVersion || 0)) {
      return res.status(401).json({ error: 'Sesija je istekla. Prijavite se ponovno.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function attachUser(req, res, next) {
  req.user = req.session?.userId ? { id: req.session.userId } : null;
  next();
}
