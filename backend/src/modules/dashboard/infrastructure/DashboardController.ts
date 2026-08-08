import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../application/DashboardService';
import { AuthContext } from '../../../middlewares/auth';

type AuthenticatedRequest = Request & { authContext: AuthContext };

const getAuthCtx = (req: Request): AuthContext => {
  return (req as AuthenticatedRequest).authContext;
};

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinicId, membershipId, role } = getAuthCtx(req);

      const dashboard = await this.dashboardService.getDashboard(clinicId, membershipId, role);

      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  };
}
