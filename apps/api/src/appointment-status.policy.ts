import { AppointmentStatus } from '@prisma/client';

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  BOOKED: ['CONFIRMED', 'COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADVISOR', 'CANCELLED_BY_ADMIN', 'RESCHEDULED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADVISOR', 'CANCELLED_BY_ADMIN', 'RESCHEDULED', 'STUDENT_NO_SHOW', 'ADVISOR_NO_SHOW'],
  COMPLETED: [],
  CANCELLED_BY_STUDENT: [],
  CANCELLED_BY_ADVISOR: [],
  CANCELLED_BY_ADMIN: [],
  RESCHEDULED: [],
  STUDENT_NO_SHOW: [],
  ADVISOR_NO_SHOW: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) throw new Error(`Transition de statut interdite : ${from} -> ${to}`);
}

export function canStudentAccessAppointment(status: AppointmentStatus): boolean {
  return !status.startsWith('CANCELLED');
}

export function isCancellationReasonValid(reason?: string): boolean {
  const length = reason?.trim().length ?? 0;
  return length >= 3 && length <= 500;
}

export function shouldRepublishAvailability(status: AppointmentStatus, startsAt: Date, now = new Date()): boolean {
  return status === 'CANCELLED_BY_STUDENT' && startsAt > now;
}
