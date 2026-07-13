import { AppointmentStatus } from '@prisma/client';

const transitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  BOOKED: ['CONFIRMED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADVISOR', 'RESCHEDULED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADVISOR', 'RESCHEDULED', 'STUDENT_NO_SHOW', 'ADVISOR_NO_SHOW'],
  COMPLETED: [],
  CANCELLED_BY_STUDENT: [],
  CANCELLED_BY_ADVISOR: [],
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
