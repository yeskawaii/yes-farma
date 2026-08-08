import type { PrismaClient, AppointmentStatus } from '../../../generated/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { getStartOfDay, getStartOfWeek, addCalendarDays } from '../../../shared/utils/timezone';

export interface IDashboardRepository {
  clinic: PrismaClient['clinic'];
  appointment: PrismaClient['appointment'];
  patient: PrismaClient['patient'];
  clinicalEncounter: PrismaClient['clinicalEncounter'];
}

export interface DashboardUpcomingAppointment {
  id: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  patient: {
    id: string;
    displayName: string;
  };
  professional: {
    membershipId: string;
    displayName: string;
  };
}

export interface DashboardTodaySummary {
  appointmentsTotal: number;
  appointmentsUpcoming: number;
  appointmentsInProgress: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  appointmentsNoShow: number;
}

export interface DashboardWeekSummary {
  appointmentsTotal: number;
  appointmentsCompleted: number;
  appointmentsCancelled: number;
  appointmentsNoShow: number;
  patientsSeen: number;
  scheduledMinutes: number;
}

export interface ProfessionalDashboardResponse {
  scope: 'PERSONAL';
  generatedAt: string;
  timeZone: string;
  today: DashboardTodaySummary;
  upcomingAppointments: DashboardUpcomingAppointment[];
  week: DashboardWeekSummary;
  pending: {
    draftClinicalEncounters: number;
  };
}

export interface OwnerDashboardResponse {
  scope: 'CLINIC';
  generatedAt: string;
  timeZone: string;
  today: DashboardTodaySummary;
  upcomingAppointments: DashboardUpcomingAppointment[];
  week: DashboardWeekSummary;
  patients: {
    activeTotal: number;
  };
}

export interface AssistantDashboardResponse {
  scope: 'CLINIC_ADMIN';
  generatedAt: string;
  timeZone: string;
  today: DashboardTodaySummary;
  upcomingAppointments: DashboardUpcomingAppointment[];
  week: DashboardWeekSummary;
  patients: {
    activeTotal: number;
  };
}

export type DashboardResponse =
  | ProfessionalDashboardResponse
  | OwnerDashboardResponse
  | AssistantDashboardResponse;

export class DashboardService {
  constructor(
    private readonly prisma: IDashboardRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

  private formatDisplayName(firstName: string, lastName: string, secondLastName?: string | null): string {
    const parts = [firstName, lastName];
    if (secondLastName) parts.push(secondLastName);
    return parts.join(' ');
  }

  async getDashboard(clinicId: string, membershipId: string, role: string): Promise<DashboardResponse> {
    if (!['PROFESSIONAL', 'OWNER', 'ASSISTANT'].includes(role)) {
      throw new AppError('FORBIDDEN', 'Rol no autorizado para acceder al dashboard', 403);
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timeZone: true }
    });

    if (!clinic) {
      throw new AppError('NOT_FOUND', 'Clínica no encontrada', 404);
    }

    const timeZone = clinic.timeZone;
    const now = this.clock();

    const todayStart = getStartOfDay(now, timeZone);
    const tomorrowStart = addCalendarDays(todayStart, timeZone, 1);

    const weekStart = getStartOfWeek(now, timeZone);
    const nextWeekStart = addCalendarDays(weekStart, timeZone, 7);

    // Filters for query
    const professionalFilter = role === 'PROFESSIONAL' ? { professionalMembershipId: membershipId } : {};

    // 1. Fetch appointments for the whole week
    // Select only minimum needed for week/today metrics, and full details for upcoming calculation
    const weekAppointments = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        startAt: {
          gte: weekStart,
          lt: nextWeekStart
        },
        ...professionalFilter
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        patientId: true,
      },
      orderBy: [
        { startAt: 'asc' },
        { endAt: 'asc' },
        { id: 'asc' }
      ]
    });

    // 2. Metrics calculation
    let weekTotal = 0;
    let weekCompleted = 0;
    let weekCancelled = 0;
    let weekNoShow = 0;
    let weekScheduledMinutes = 0;
    const weekPatientsSeen = new Set<string>();

    let todayTotal = 0;
    let todayUpcomingCount = 0;
    let todayInProgress = 0;
    let todayCompleted = 0;
    let todayCancelled = 0;
    let todayNoShow = 0;

    const upcomingIds: string[] = [];

    for (const appt of weekAppointments) {
      const isToday = appt.startAt >= todayStart && appt.startAt < tomorrowStart;

      // Week stats
      weekTotal++;
      if (appt.status === 'COMPLETED') {
        weekCompleted++;
        weekPatientsSeen.add(appt.patientId);
      } else if (appt.status === 'CANCELLED') {
        weekCancelled++;
      } else if (appt.status === 'NO_SHOW') {
        weekNoShow++;
      }

      if (['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(appt.status)) {
        const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
        weekScheduledMinutes += Math.floor(durationMs / 60000);
      }

      // Today stats
      if (isToday) {
        todayTotal++;
        if (appt.status === 'IN_PROGRESS') todayInProgress++;
        else if (appt.status === 'COMPLETED') todayCompleted++;
        else if (appt.status === 'CANCELLED') todayCancelled++;
        else if (appt.status === 'NO_SHOW') todayNoShow++;
        else if (['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
          if (appt.startAt >= now) {
            todayUpcomingCount++;
            if (upcomingIds.length < 5) {
              upcomingIds.push(appt.id);
            }
          }
        }
      }
    }

    // 3. Fetch details for Upcoming Appointments
    const upcomingAppointments: DashboardUpcomingAppointment[] = [];
    if (upcomingIds.length > 0) {
      const upcomingDetails = await this.prisma.appointment.findMany({
        where: {
          id: { in: upcomingIds },
          clinicId,
          ...professionalFilter
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              secondLastName: true
            }
          },
          professional: {
            select: {
              id: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      // Re-sort the fetched details according to the order in upcomingIds (which is startAt asc, endAt asc, id asc)
      const detailsMap = new Map(upcomingDetails.map(d => [d.id, d]));

      for (const id of upcomingIds) {
        const d = detailsMap.get(id);
        // Handle eventual consistency: if a record was reassigned/deleted between queries
        if (d) {
          upcomingAppointments.push({
            id: d.id,
            startAt: d.startAt,
            endAt: d.endAt,
            status: d.status,
            patient: {
              id: d.patient.id,
              displayName: this.formatDisplayName(d.patient.firstName, d.patient.lastName, d.patient.secondLastName)
            },
            professional: {
              membershipId: d.professional.id,
              displayName: this.formatDisplayName(d.professional.user.firstName, d.professional.user.lastName)
            }
          });
        }
      }
    }

    const today: DashboardTodaySummary = {
      appointmentsTotal: todayTotal,
      appointmentsUpcoming: todayUpcomingCount,
      appointmentsInProgress: todayInProgress,
      appointmentsCompleted: todayCompleted,
      appointmentsCancelled: todayCancelled,
      appointmentsNoShow: todayNoShow
    };

    const week: DashboardWeekSummary = {
      appointmentsTotal: weekTotal,
      appointmentsCompleted: weekCompleted,
      appointmentsCancelled: weekCancelled,
      appointmentsNoShow: weekNoShow,
      patientsSeen: weekPatientsSeen.size,
      scheduledMinutes: weekScheduledMinutes
    };

    // Construct response
    if (role === 'PROFESSIONAL') {
      const pendingDrafts = await this.prisma.clinicalEncounter.count({
        where: {
          clinicId,
          professionalMembershipId: membershipId,
          status: 'DRAFT'
        }
      });

      return {
        scope: 'PERSONAL',
        generatedAt: now.toISOString(),
        timeZone,
        today,
        upcomingAppointments,
        week,
        pending: {
          draftClinicalEncounters: pendingDrafts
        }
      };
    }

    if (role === 'OWNER') {
      const activePatientsCount = await this.prisma.patient.count({
        where: {
          clinicId,
          status: 'ACTIVE'
        }
      });

      return {
        scope: 'CLINIC',
        generatedAt: now.toISOString(),
        timeZone,
        today,
        upcomingAppointments,
        week,
        patients: {
          activeTotal: activePatientsCount
        }
      };
    }

    // role === 'ASSISTANT'
    const activePatientsCount = await this.prisma.patient.count({
      where: {
        clinicId,
        status: 'ACTIVE'
      }
    });

    return {
      scope: 'CLINIC_ADMIN',
      generatedAt: now.toISOString(),
      timeZone,
      today,
      upcomingAppointments,
      week,
      patients: {
        activeTotal: activePatientsCount
      }
    };
  }
}
