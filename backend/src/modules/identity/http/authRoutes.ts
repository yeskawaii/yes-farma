import { Router } from 'express';
import { authController } from './authController';
import { authMiddleware } from '../../../middlewares/auth';
import { validateOrigin } from '../../../middlewares/validateOrigin';
import { rateLimiter } from '../../../middlewares/rateLimiter';

export const authRoutes = Router();

authRoutes.post('/login', rateLimiter, authController.login);
authRoutes.post('/logout', validateOrigin, authController.logout);
authRoutes.get('/me', authMiddleware, authController.me);
